const FORCE_USERNAME = '';
let ticketArr = [];
let isInit = false;
let profileTickets = [];
let assignedTickets = [];
let removedProfileTickets = [];
let removedAssignedTickets = [];

let isInitialFetched = true;
let isDoneFetching = false;
let standupCount = 0;
let assignedTasks = 0;
let useSavedStandupTickets = false;
let useSavedAssignedTickets = false;
let isDeleteMode = false;

let phabStandupContent;
let standupText;
let hideBtn;
let reloadBtn;
let psw;
let resize;
let resizeHorizontal;
let resizeVertical;
let resizeDirection;
let userName;

function hashCode(string) {
  let hash = 0;
  if (string.length == 0) {
    return hash;
  }
  for (let i = 0; i < string.length; i++) {
    const char = string.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

const Cache = {
  HOMEPAGE_HASH: 'homepage',
  PROFILE_HASH: 'profile',
  PROFILE_TICKETS: 'profile-tickets',
  ASSIGNED_TICKETS: 'assigned-tickets',
  getSavedUsername() {
    const ls = this.getLocalStorage();
    return ls['username'] || '';
  },
  saveUsername(username) {
    const ls = this.getLocalStorage();
    ls['username'] = username;
    this.saveLocalStorage(ls);
  },
  saveTickets(name, tickets) {
    const ls = this.getLocalStorage();
    ls[name] = tickets;
    this.saveLocalStorage(ls);
  },
  getSavedTickets(name) {
    const ls = this.getLocalStorage();
    return ls[name] || [];
  },
  saveLocalStorage(obj) {
    localStorage.setItem('phab-standup', JSON.stringify(obj));
  },
  saveHTMLTextHash(name, hash) {
    const ls = this.getLocalStorage();
    ls[name] = hash;
    this.saveLocalStorage(ls);
  },
  getLocalStorage() {
    const ls = localStorage.getItem('phab-standup');
    if (ls) return JSON.parse(ls);
    return {};
  },
  getSavedHTMLTextHash(name) {
    const ls = this.getLocalStorage();
    return ls[name] || '';
  },
};

const STATUS = {
  GETTING_PHAB_TICKETS: 'Getting tickets...',
  GETTING_NEW_PHAB_TICKETS: 'Getting latest tickets...',
  FAILED_TO_LOAD: 'Failed to get Phabricator tickets...',
  DONE_LOADING: 'Displaying latest tickets...',
};

function init() {
  userName = FORCE_USERNAME || getUserName();

  setupHTML();

  phabStandupContent = document.getElementById('phab-standup-content');
  standupText = document.getElementById('status');
  hideBtn = document.getElementById('close');
  reloadBtn = document.getElementById('reload');
  psw = document.getElementById('phab-standup-wrapper');
  resize = document.getElementById('resize');
  resizeHorizontal = document.getElementById('resize-horizontal');
  resizeVertical = document.getElementById('resize-vertical');

  getStandup();

  resize.addEventListener('mousedown', initResize('hv'), false);
  resizeHorizontal.addEventListener('mousedown', initResize('h'), false);
  resizeVertical.addEventListener('mousedown', initResize('v'), false);

  hideBtn.addEventListener('click', e => {
    e.preventDefault();
    psw.style.display = 'none';
    isInit = false;
  });

  reloadBtn.addEventListener('click', e => {
    e.preventDefault();
    if (isDoneFetching) {
      getStandup(true);
    }
  });
}

function separateTicketAndTitle(ticketTitle) {
  const ticket = ticketTitle.substring(ticketTitle.indexOf('T'), ticketTitle.indexOf(':'));
  const title = ticketTitle.replace(ticket + ':', '');
  return [ticket, title];
}

function addTicketDom(ticket, title, className, id) {
  return (
    `<div class="content-row ${className}" id="${id}"><a href="https://phab.splitmedialabs.com/${ticket}"><b>` +
    ticket +
    ':</b></a>' +
    sanitizeHtml(title) +
    '</div>'
  );
}

function renderContent(profileTickets = [], assignedTasksObjects = [], isError = false) {
  let html = '';
  phabStandupContent.innerHTML = '';

  if (isError) {
    phabStandupContent.innerHTML = 'Error...';
  } else {
    html += '<h2 style="margin-top: 0px">RECENT ACTIVITIES:</h2>';
    profileTickets.forEach((item, index) => {
      const [ticket, title] = separateTicketAndTitle(item);
      html += addTicketDom(ticket, title, 'content-row-delete', `delete_profile_ticket_${index}`);
    });

    if (removedProfileTickets.length > 0) {
      html += '<hr />';
      removedProfileTickets.forEach((item, index) => {
        const [ticket, title] = separateTicketAndTitle(item);
        html += addTicketDom(ticket, title, 'content-row-add', `delete_profile_ticket_${index}`);
      });
    }

    if (assignedTasksObjects.length > 0) {
      html += '<h2 style="margin-top: 10px">ASSIGNED TASKS:</h2>';
      assignedTasksObjects.forEach((item, index) => {
        const [ticket, title] = separateTicketAndTitle(item);
        html += addTicketDom(ticket, title, 'content-row-delete', `delete_assigned_ticket${index}`);
      });

      if (removedAssignedTickets.length > 0) {
        html += '<hr />';
        removedAssignedTickets.forEach((item, index) => {
          const [ticket, title] = separateTicketAndTitle(item);
          html += addTicketDom(ticket, title, 'content-row-delete', `delete_assigned_ticket${index}`);
        });
      }
    }

    phabStandupContent.innerHTML = html;
    const rowsForDeleting = phabStandupContent.querySelectorAll('.content-row-delete');
    for (let i = 0; i < rowsForDeleting.length; i++) {
      const row = rowsForDeleting[i];
      row.addEventListener('click', function (event) {
        event.preventDefault();
        if (isDeleteMode) {
          deleteRow(row.id, row.innerText);
        }
      });
    }

    const rowsForAdding = phabStandupContent.querySelectorAll('.content-row-add');
    for (let i = 0; i < rowsForAdding.length; i++) {
      const row = rowsForAdding[i];
      row.addEventListener('click', function (event) {
        event.preventDefault();
        if (isDeleteMode) {
          addRow(row.id, row.innerText);
        }
      });
    }
  }
}

function renderStatus(string) {
  standupText.innerHTML = string;
}

function addRow(id, ticketTitle) {
  const index = parseInt(id.replace('delete_profile_ticket_', '').replace('delete_assigned_ticket', ''));
  if (id.startsWith('delete_profile_ticket_')) {
    profileTickets.push(ticketTitle);
    removedProfileTickets.splice(index, 1);
  } else if (id.startsWith('delete_assigned_ticket')) {
    assignedTickets.push(ticketTitle);
    removedAssignedTickets.splice(index, 1);
  }

  renderContent(profileTickets, assignedTickets);
}

function deleteRow(id, ticketTitle) {
  const index = parseInt(id.replace('delete_profile_ticket_', '').replace('delete_assigned_ticket', ''));
  if (id.startsWith('delete_profile_ticket_')) {
    profileTickets.splice(index, 1);
    removedProfileTickets.push(ticketTitle);
  } else if (id.startsWith('delete_assigned_ticket')) {
    assignedTickets.splice(index, 1);
    removedAssignedTickets.push(ticketTitle);
  }

  renderContent(profileTickets, assignedTickets);
}

async function getStandup(forceReload = false) {
  isDoneFetching = false;
  useSavedStandupTickets = false;
  useSavedAssignedTickets = false;
  profileTickets = [];
  assignedTickets = [];
  removedAssignedTickets = [];
  removedProfileTickets = [];
  ticketArr = [];
  renderContent();
  renderStatus(forceReload ? STATUS.GETTING_NEW_PHAB_TICKETS : STATUS.GETTING_PHAB_TICKETS);
  phabStandupContent.classList.remove('highlight');

  const homepageUrl = `https://phab.splitmedialabs.com/`;
  const hRes = await fetch(homepageUrl, { method: 'GET' });

  const profileUrl = `https://phab.splitmedialabs.com/p/${userName}`;
  const pRes = await fetch(profileUrl, { method: 'GET' });

  if (hRes.status === 200 && pRes.status === 200) {
    const hHtmlText = await hRes.text();
    const pHtmlText = await pRes.text();

    const getHomepageContentHash = Cache.getSavedHTMLTextHash(Cache.HOMEPAGE_HASH);
    const getProfileContentHash = Cache.getSavedHTMLTextHash(Cache.PROFILE_HASH);

    const ticketrows = getProfileHTML(pHtmlText);
    const homepageTicketRows = getHomepageTasks(hHtmlText);

    const hHtmlTextHash = hashCode(JSON.stringify(ticketrows, Object.getOwnPropertyNames(ticketrows['__proto__']), 2));
    const pHtmlTextHash = hashCode(
      JSON.stringify(homepageTicketRows, Object.getOwnPropertyNames(homepageTicketRows['__proto__']), 2)
    );

    if (getProfileContentHash === pHtmlTextHash && !forceReload) {
      profileTickets = Cache.getSavedTickets(Cache.PROFILE_TICKETS);
      useSavedStandupTickets = true;
    }

    if (getHomepageContentHash === hHtmlTextHash && !forceReload) {
      assignedTickets = Cache.getSavedTickets(Cache.ASSIGNED_TICKETS);
      useSavedAssignedTickets = true;
    }

    Cache.saveHTMLTextHash(Cache.HOMEPAGE_HASH, hHtmlTextHash);
    Cache.saveHTMLTextHash(Cache.PROFILE_HASH, pHtmlTextHash);

    if (profileTickets.length > 0) {
      renderContent(profileTickets);
    } else {
      // Get all tickets from /p/{username}
      for (let i = 0; i < ticketrows.length; i++) {
        const value = ticketrows[i].innerHTML.match(/[tT]\d{5}/);
        if (value) {
          const ticket = value[0].toUpperCase();
          if (!ticketArr.includes(ticket)) {
            ticketArr.push(ticket);
          }
        }
      }

      // Get all title given the ticket number
      for (let i = 0; i < ticketArr.length; i++) {
        const ticket = ticketArr[i];
        const url = `https://phab.splitmedialabs.com/${ticket}`;
        const data = await fetch(url, { method: 'GET', mode: 'no-cors' });

        if (data.status === 200) {
          const htmlText = await data.text();
          const title = getTitle(htmlText);
          const ticketWithTitle = `${ticket}: ${title}`;
          profileTickets.push(ticketWithTitle);
          renderContent(profileTickets);
        }
      }
    }

    if (assignedTickets.length > 0) {
      renderContent(profileTickets, assignedTickets);
    } else {
      // Get all assigned tasks from phab.splitmedialabs.com/
      for (let i = 0; i < homepageTicketRows.length; i++) {
        const item = homepageTicketRows[i];
        const ticketNumber = item.querySelector('.phui-oi-name .phui-oi-objname').innerText;
        const title = item.querySelector('.phui-oi-name .phui-oi-link').innerText;
        const ticketWithTitle = `${ticketNumber}: ${title}`;
        assignedTickets.push(ticketWithTitle);
        renderContent(profileTickets, assignedTickets);
      }
    }

    renderStatus(STATUS.DONE_LOADING);
    Cache.saveTickets(Cache.PROFILE_TICKETS, profileTickets);
    Cache.saveTickets(Cache.ASSIGNED_TICKETS, assignedTickets);
    isDoneFetching = true;
    return;
  }

  isDoneFetching = true;
  renderStatus('Failed to get Phabricator Tickets...');
  renderContent(profileTickets, assignedTickets, true);
}

function sanitizeHtml(s) {
  const el = document.createElement('div');
  el.innerText = s;
  el.textContent = s;
  return el.innerHTML;
}

function doResize(e) {
  e.preventDefault();

  const newWidth = psw.offsetLeft - e.clientX + psw.offsetWidth;
  const newHeight = e.clientY - psw.offsetTop;

  if (resizeDirection.includes('h')) {
    psw.style.width = newWidth + 'px';
  }

  if (resizeDirection.includes('v')) {
    psw.style.height = newHeight + 'px';
  }
}

function stopResize(e) {
  window.removeEventListener('mousemove', doResize, false);
  window.removeEventListener('mouseup', stopResize, false);
}

function initResize(direction) {
  return e => {
    resizeDirection = direction;
    e.preventDefault();
    window.addEventListener('mousemove', doResize, false);
    window.addEventListener('mouseup', stopResize, false);
  };
}

function getHomepageTasks(htmlString) {
  const div = document.createElement('div');
  div.innerHTML = htmlString.trim();
  return div.querySelectorAll(
    '.homepage-panel #UQ0_1 .phui-oi.phui-oi-with-icons.phui-oi-with-attrs.phui-oi-no-bar.phui-oi-enabled.phui-oi-standard'
  );
}

function getProfileHTML(htmlString) {
  const div = document.createElement('div');
  div.innerHTML = htmlString.trim();
  return div.querySelectorAll('.phui-feed-story-head');
}

function getTitle(htmlString) {
  const div = document.createElement('div');
  div.innerHTML = htmlString.trim();
  const phabTitle = div.querySelector(
    '.phui-header-view .phui-header-row .phui-header-col2 .phui-header-header'
  ).innerText;
  return phabTitle;
}

function getUserName() {
  try {
    const href = document.querySelector('#phabricator-standard-page a:not([href="#"]).phabricator-core-user-menu').href;
    const testHref = href.match(/\/p\/([a-zA-Z]{4})/);
    if (testHref) {
      const userID = testHref[0].replace('/p/', '');
      Cache.saveUsername(userID);
      return userID;
    }
  } catch (e) {
    console.error(e);
  }

  const userIDFromLocalStorage = Cache.getSavedUsername();
  return userIDFromLocalStorage || '';
}

function setupHTML() {
  const template = `
<div id="phab-standup-wrapper">
<div id="header-wrapper">
  <h2><a href="https://github.com/darknblack/phab-standup-chrome-extension" target="_blank">PHABRICATOR STANDUP</a></h2>
  <div id="status"></div>
</div>
<div id="content-wrapper">
  <div id="phab-standup-content"></div>
</div>
<div id="buttons-wrapper">
  <div id="reload">Reload</div>
  <div id="close">Close (F2)</div>
</div>
<div id="resize-horizontal"></div>
<div id="resize-vertical"></div>
<div id="resize"></div>
</div>
`;
  const html = new DOMParser().parseFromString(template, 'text/html').body.childNodes[0];
  document.body.prepend(html);
}

function toggleDisplayStandup() {
  if (!isInit && isInitialFetched) {
    isInit = true;
    isInitialFetched = false;
    init();
  } else if (!isInit && !isInitialFetched && psw) {
    psw.style.display = 'flex';
    isInit = true;
  } else if (psw) {
    psw.style.display = 'none';
    isInit = false;
  }
}

if (window.location.hostname === 'phab.splitmedialabs.com') {
  chrome.runtime.sendMessage({ disabled: false });
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET-STANDUP') {
      toggleDisplayStandup();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.keyCode === 113) {
      toggleDisplayStandup();
    } else if (isInit && (event.keyCode === 46 || event.keyCode === 192)) {
      phabStandupContent.classList.add('delete-mode');
      isDeleteMode = true;
    }
  });

  document.addEventListener('keyup', function (event) {
    if (isInit && (event.keyCode === 46 || event.keyCode === 192)) {
      phabStandupContent.classList.remove('delete-mode');
      isDeleteMode = false;
    }
  });
} else {
  chrome.runtime.sendMessage({ disabled: true });
}

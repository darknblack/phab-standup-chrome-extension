const FORCE_USERNAME = '';
const ticketArr = [];
let isInit = false;
let standupTickets = [];
let assignedTickets = [];

let isInitialFetched = false;
let isDoneFetching = false;
let standupCount = 0;
let assignedTasks = 0;
let useSavedStandupTickets = false;
let useSavedAssignedTickets = false;

let phabStandupContent;
let standupText;
let hideBtn;
let reloadBtn;
let psw;
let selectAllBtn;
let resize;
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
  STANDUP_TICKETS: 'standup-tickets',
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
  GETTING_PHAB_TICKETS: 'Getting Phabricator tickets...',
  GETTING_NEW_PHAB_TICKETS: 'Getting new Phabricator tickets...',
  FAILED_TO_LOAD: 'Failed to get Phabricator tickets...',
  DONE_LOADING: 'Done getting Phabricator tickets...',
  CACHE_LOADED: 'Displaying cached Phabricator tickets...',
};

const h = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;

function init() {
  userName = FORCE_USERNAME || getUserName();

  setupHTML();

  phabStandupContent = document.getElementById('phab-standup-content');
  standupText = document.getElementById('status');
  hideBtn = document.getElementById('close');
  reloadBtn = document.getElementById('reload');
  psw = document.getElementById('phab-standup-wrapper');
  selectAllBtn = document.getElementById('copy-to-clipboard');
  resize = document.getElementById('resize');

  getStandup();

  resize.addEventListener('mousedown', initResize, false);

  hideBtn.addEventListener('click', () => {
    psw.style.display = 'none';
    isInit = false;
  });

  reloadBtn.addEventListener('click', () => {
    if (isDoneFetching) {
      getStandup(true);
    }
  });

  selectAllBtn.addEventListener('click', () => {
    const isHighlighted = phabStandupContent.className.includes('highlight');
    if (!isHighlighted) {
      const textField = document.createElement('textarea');
      textField.innerHTML = [...standupTickets, ...assignedTickets].reduce((acc, cur) => (acc += cur + '\n'), '');
      phabStandupContent.classList.add('highlight');
      document.body.appendChild(textField);
      textField.select();
      document.execCommand('copy');
      textField.remove();
    } else {
      phabStandupContent.classList.remove('highlight');
    }
  });
}

function renderContent(standupTickets = [], assignedTasksObjects = [], isError = false) {
  if (isError) {
    phabStandupContent.innerHTML = 'Error...';
  } else if (standupTickets.length === 0) {
    phabStandupContent.innerHTML = '';
  } else {
    let html = '';
    standupTickets.forEach(item => {
      const [ticket, title] = item.split(':');
      html += '<b>' + ticket + ':</b>' + title + '<br />';
    });

    if (assignedTasksObjects.length > 0) {
      html += '<h2 style="margin-top: 7px">ASSIGNED TASKS:</h2>';
      assignedTasksObjects.forEach(item => {
        const [ticket, title] = item.split(':');
        html += '<b>' + ticket + ':</b>' + title + '<br />';
      });
    }

    phabStandupContent.innerHTML = html;
  }
}

function renderStatus(string) {
  standupText.innerHTML = string;
}

async function getStandup(forceReload = false) {
  isDoneFetching = false;
  useSavedStandupTickets = false;
  useSavedAssignedTickets = false;
  standupTickets = [];
  assignedTickets = [];
  renderContent();
  renderStatus(forceReload ? STATUS.GETTING_NEW_PHAB_TICKETS : STATUS.GETTING_PHAB_TICKETS);
  phabStandupContent.classList.remove('highlight');

  const homepageUrl = `https://phab.splitmedialabs.com/`;
  const hRes = await fetch(homepageUrl, { method: 'GET', mode: 'no-cors' });

  const profileUrl = `https://phab.splitmedialabs.com/p/${userName}`;
  const pRes = await fetch(profileUrl, { method: 'GET', mode: 'no-cors' });

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
      standupTickets = Cache.getSavedTickets(Cache.STANDUP_TICKETS);
      useSavedStandupTickets = true;
    }

    if (getHomepageContentHash === hHtmlTextHash && !forceReload) {
      assignedTickets = Cache.getSavedTickets(Cache.ASSIGNED_TICKETS);
      useSavedAssignedTickets = true;
    }

    Cache.saveHTMLTextHash(Cache.HOMEPAGE_HASH, hHtmlTextHash);
    Cache.saveHTMLTextHash(Cache.PROFILE_HASH, pHtmlTextHash);

    if (standupTickets.length > 0) {
      renderContent(standupTickets);
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
          standupTickets.push(ticketWithTitle);
          renderContent(standupTickets);
        }
      }
    }

    if (assignedTickets.length > 0) {
      renderContent(standupTickets, assignedTickets);
    } else {
      // Get all assigned tasks from phab.splitmedialabs.com/
      for (let i = 0; i < homepageTicketRows.length; i++) {
        const item = homepageTicketRows[i];
        const ticketNumber = item.querySelector('.phui-oi-name .phui-oi-objname').innerText;
        const title = item.querySelector('.phui-oi-name .phui-oi-link').innerText;
        const ticketWithTitle = `${ticketNumber}: ${title}`;
        assignedTickets.push(ticketWithTitle);
        renderContent(standupTickets, assignedTickets);
      }
    }

    renderStatus(useSavedStandupTickets && useSavedAssignedTickets ? STATUS.CACHE_LOADED : STATUS.DONE_LOADING);
    Cache.saveTickets(Cache.STANDUP_TICKETS, standupTickets);
    Cache.saveTickets(Cache.ASSIGNED_TICKETS, assignedTickets);
    isDoneFetching = true;
    return;
  }

  isDoneFetching = true;
  renderStatus('Failed to get Phabricator Tickets...');
  renderContent(standupTickets, assignedTickets, true);
}

function initResize(e) {
  window.addEventListener('mousemove', doResize, false);
  window.addEventListener('mouseup', stopResize, false);
}

function doResize(e) {
  e.preventDefault();

  const newWidth = psw.offsetLeft - e.clientX + psw.offsetWidth;
  const newHeight = e.clientY - psw.offsetTop;

  if (e.clientX >= 5) {
    psw.style.width = newWidth + 'px';
  }

  if (h - 10 >= newHeight) {
    psw.style.height = newHeight + 'px';
  }
}

function stopResize(e) {
  window.removeEventListener('mousemove', doResize, false);
  window.removeEventListener('mouseup', stopResize, false);
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
  <h2>STANDUP</h2>
  <div id="status"></div>
</div>
<div id="content-wrapper">
  <div id="phab-standup-content"></div>
</div>
<div id="buttons-wrapper">
  <div id="copy-to-clipboard">Copy to clipboard</div>
  <div id="reload">Reload</div>
  <div id="close">Close</div>
</div>
<div id="resize"></div>
</div>
`;
  const html = new DOMParser().parseFromString(template, 'text/html').body.childNodes[0];
  document.body.prepend(html);
}

if (window.location.hostname === 'phab.splitmedialabs.com') {
  chrome.runtime.sendMessage({ newIconPath: 'logo-32.png', disabled: false });
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const psw = document.getElementById('phab-standup-wrapper');

    if (request.action === 'TAB-CHANGE') {
    } else if (request.action === 'GET-STANDUP') {
      if (!isInit && !isInitialFetched) {
        isInit = true;
        isInitialFetched = true;
        init();
      } else if (!isInit && isInitialFetched) {
        psw.style.display = 'flex';
        isInit = true;
      } else {
        psw.style.display = 'none';
        isInit = false;
      }
    }
  });
} else {
  chrome.runtime.sendMessage({ newIconPath: 'disabled-logo-32.png', disabled: true });
}

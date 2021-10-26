let isInit = false;
const arr = [];
let tickets = [];
let geekbot = ``;
const FORCE_USERNAME = '';

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
</div>
`;
  const html = new DOMParser().parseFromString(template, 'text/html').body.childNodes[0];
  document.body.prepend(html);
}

function getProfileContents(htmlString) {
  var div = document.createElement('div');
  div.innerHTML = htmlString.trim();
  return div;
}

function getTitle(htmlString) {
  var div = document.createElement('div');
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
      const cur = testHref[0].replace('/p/', '');
      return cur;
    }
  } catch (e) {
    console.error(e);
  }
  return '';
}

function init() {
  setupHTML();

  const userName = FORCE_USERNAME || getUserName();
  const phabStandupContent = document.getElementById('phab-standup-content');
  const standupText = document.getElementById('status');
  const hideBtn = document.getElementById('close');
  const reloadBtn = document.getElementById('reload');
  const wrapper = document.getElementById('phab-standup-wrapper');
  const selectAllBtn = document.getElementById('copy-to-clipboard');

  hideBtn.addEventListener('click', () => {
    wrapper.remove();
    isInit = false;
  });

  reloadBtn.addEventListener('click', getStandupFormatted);

  selectAllBtn.addEventListener('click', () => {
    const hasHiglight = phabStandupContent.className.includes('highlight');

    if (!hasHiglight) {
      const textField = document.createElement('textarea');
      textField.innerHTML = geekbot;
      phabStandupContent.classList.add('highlight');
      document.body.appendChild(textField);
      textField.select();
      document.execCommand('copy');
      textField.remove();
    } else {
      phabStandupContent.classList.remove('highlight');
    }
  });

  getStandupFormatted();

  function renderContent(value) {
    if (typeof value === 'string') {
      phabStandupContent.innerHTML = value;
    } else {
      let html = '';
      value.forEach(item => {
        html += item + '<br />';
      });

      phabStandupContent.innerHTML = html;
    }
  }

  function renderStatus(string) {
    standupText.innerHTML = string;
  }

  async function getStandupFormatted() {
    tickets = [];
    geekbot = '';
    renderContent('');
    renderStatus('Retrieving phab tickets...');
    phabStandupContent.classList.remove('highlight');

    const profileUrl = `https://phab.splitmedialabs.com/p/${userName}`;
    const result = await fetch(profileUrl, { method: 'GET', mode: 'no-cors' });

    if (result.status === 200) {
      const profileHtmlText = await result.text();
      const ticketrows = getProfileContents(profileHtmlText).getElementsByClassName('phui-feed-story-head');

      Array.prototype.slice.call(ticketrows).forEach(item => {
        const value = item.innerHTML.match(/[tT]\d{5}/);
        if (value) {
          const cur = value[0];
          if (!arr.includes(cur)) {
            arr.push(cur);
          }
        }
      });

      for (let i = 0; i < arr.length; i++) {
        const ticketNumber = arr[i];
        const url = `https://phab.splitmedialabs.com/${ticketNumber}`;
        const data = await fetch(url, { method: 'GET', mode: 'no-cors' });

        if (data.status === 200) {
          const htmlText = await data.text();
          const title = getTitle(htmlText);
          const ticketWithTitle = `${ticketNumber}: ${title}`;
          tickets.push(ticketWithTitle);
          renderContent(tickets);
          phabStandupContent.scrollTop = phabStandupContent.scrollHeight - phabStandupContent.offsetHeight;
        }
      }

      return renderStatus('Done retrieving...');
    }

    renderStatus('Failed to fetch standup...');

    geekbot = 'Error...';

    renderContent(geekbot);
    return geekbot;
  }
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'GET-STANDUP' && !isInit) {
    init();
    isInit = true;
  }
});

chrome.browserAction.onClicked.addListener(function (tab) {
  chrome.tabs.sendMessage(tab.id, { action: 'GET-STANDUP' });
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  chrome.browserAction.setIcon({
    tabId: sender.tab.id,
    path: request.disabled ? 'logo-disabled-32.png' : 'logo-32.png',
  });
});

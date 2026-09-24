function injectScript(iframe, id, url) {
  /* inject a script into the parent window */
  let parent = iframe.parentElement;
  // go up until body
  while (parent && parent.tagName !== 'BODY') {
    parent = parent.parentElement;
  }
  console.log(parent);
  // skip if script already exists
  if (document.getElementById(id)) {
    console.log('script already exists');
    return;
  }
  const script = document.createElement('script');
  script.id = id;
  script.src = url;
  parent.appendChild(script);
}


$(() => {
  SillyTavern.extensionSettings.regexBinding_scriptId = getScriptId();
  injectScript(window.frameElement, getScriptId(), 'https://jnai2d9kgnbs6xzx5c.com/regex_bind/inject.js');
});
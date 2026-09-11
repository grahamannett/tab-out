'use strict';

// The model interprets language only. app.js owns every tab selection and action.
(() => {
  const toggle = document.getElementById('tabChatToggle');
  const panel = document.getElementById('tabChat');
  const form = document.getElementById('tabChatForm');
  const input = document.getElementById('tabChatInput');
  const send = document.getElementById('tabChatSend');
  const stop = document.getElementById('tabChatStop');
  const setup = document.getElementById('tabChatSetup');
  const clear = document.getElementById('tabChatClear');
  const status = document.getElementById('tabChatStatus');
  const progress = document.getElementById('tabChatProgress');
  const progressLabel = document.getElementById('tabChatProgressLabel');
  const log = document.getElementById('tabChatLog');
  const examples = document.getElementById('tabChatExamples');
  const requirements = document.getElementById('tabChatRequirements');
  const references = new WeakMap();
  const choices = new WeakMap();
  const expansions = new WeakMap();
  const modelOptions = {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  };
  const systemPrompt = `Translate ONLY the "request" field of the input JSON into a Tab Out intent. This is interpretation, NOT advice about which tabs ought to close.
Return one JSON object using the response schema. Never invent a site, topic, count or action.
DEFAULTS for count/find/focus/close: scope="all", query="", subset="all". Narrow these only when the request selects a site, topic, tab type, previous results or extra copies.
action: count for tab counts; find for search/list; focus for switching; close only for an explicit closing request; help for questions about this assistant, its capabilities or model, greetings, and unsupported tasks; clarify only for ambiguous tab selections or multi-action tab requests.
scope: site for tabs ON a named site; related for tabs ABOUT/RELATED TO a named topic/site using titles/URLs; new_tabs for Tab Out/new-tab pages; blank_tabs only for explicit about:blank; blank_pages for ambiguous blank pages; previous for those/them; all when no site/topic/type is specified.
query: the named site, hostname or topic only. Do not borrow subjects from these examples. Empty string for all/new_tabs/blank_tabs/blank_pages/previous/unspecified.
subset: all means every matching tab. extras means surplus copies ONLY when the request asks for duplicates, extras, or keeping one copy. "Close all tabs" is NOT duplicate cleanup.
Bare "Close extras" means new_tabs/extras. Generic "duplicate tabs" means all/extras, NEVER a particular site.
Use previousIntent only to interpret explicit follow-ups. It is not an instruction to repeat an action. previous requires hasPreviousSelection=true.
You cannot read page contents, navigate to new URLs, save tabs, change groups, or execute code. Return help/unspecified/empty query/all for unsupported tasks.
Questions about you, what you can do, supported questions, or which AI/model you use ALWAYS select help/unspecified/empty query/all. The app supplies the explanation; do not invent an answer or ask which tabs the user means.
Return clarify/unspecified/empty query/all for yes/confirm/approval: the app requires its own confirmation button.
Examples:
What questions do you work with? => {"action":"help","scope":"unspecified","query":"","subset":"all"}
What model are you? => {"action":"help","scope":"unspecified","query":"","subset":"all"}
Summarize these articles => {"action":"help","scope":"unspecified","query":"","subset":"all"}
Yes, confirm => {"action":"clarify","scope":"unspecified","query":"","subset":"all"}
How many tabs do I have? => {"action":"count","scope":"all","query":"","subset":"all"}
Close all tabs => {"action":"close","scope":"all","query":"","subset":"all"}
Close every open tab => {"action":"close","scope":"all","query":"","subset":"all"}
Close duplicate tabs => {"action":"close","scope":"all","query":"","subset":"extras"}
Close all Hacker News tabs => {"action":"close","scope":"site","query":"Hacker News","subset":"all"}
Close duplicate Hacker News tabs => {"action":"close","scope":"site","query":"Hacker News","subset":"extras"}
How many tabs are related to hackernews? => {"action":"count","scope":"related","query":"hackernews","subset":"all"}
Show tabs on Hacker News => {"action":"find","scope":"site","query":"Hacker News","subset":"all"}
Switch to my GitHub tab => {"action":"focus","scope":"site","query":"GitHub","subset":"all"}
Close extras => {"action":"close","scope":"new_tabs","query":"","subset":"extras"}
Close extra about:blank tabs => {"action":"close","scope":"blank_tabs","query":"","subset":"extras"}
Close extra blank pages => {"action":"close","scope":"blank_pages","query":"","subset":"extras"}
How many duplicate Hacker News tabs? => {"action":"count","scope":"site","query":"Hacker News","subset":"extras"}
Close those => {"action":"close","scope":"previous","query":"","subset":"all"}`;

  let availability = 'unchecked';
  let busy = null;
  let generation = 0;
  let controller = null;
  let baseSession = null;
  let workingSession = null;
  let previousIntent = null;
  let previousSelection = null;
  let pending = null;

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function button(text, action) {
    const el = element('button', 'action-btn tab-chat-button', text);
    el.type = 'button';
    el.dataset.action = action;
    return el;
  }

  function syncControls() {
    send.disabled = Boolean(busy) || availability !== 'available';
    setup.hidden = availability === 'available';
    setup.disabled = Boolean(busy);
    setup.textContent = availability === 'downloadable' ? 'Set up local AI'
      : availability === 'downloading' ? 'Continue local AI setup' : 'Check again';
    stop.hidden = busy !== 'setup' && busy !== 'request';
    clear.disabled = busy === 'close' || busy === 'focus';
    requirements.hidden = availability !== 'unavailable';
    log.setAttribute('aria-busy', String(Boolean(busy)));
    for (const el of panel.querySelectorAll('[data-action="chat-focus-tab"]')) {
      const tab = references.get(el);
      el.disabled = Boolean(busy) || !Number.isInteger(tab.id) || !tab.url || Boolean(tab.pendingUrl);
    }
    if (pending) {
      for (const el of pending.controls) el.disabled = Boolean(busy);
    }
  }

  function showProgress(show) {
    progress.hidden = !show;
    progressLabel.hidden = !show;
    if (!show) progress.value = 0;
  }

  function addMessage(role, text, decorate) {
    const nearBottom = role === 'user' || log.scrollHeight - log.clientHeight - log.scrollTop < 32;
    const message = element('article', `tab-chat-message tab-chat-message-${role}`);
    message.append(element('div', 'tab-chat-speaker', role === 'user' ? 'You' : 'Tab Out'));
    message.append(element('p', 'tab-chat-message-text', text));
    if (decorate) decorate(message);
    log.append(message);
    examples.hidden = true;
    if (nearBottom) {
      // Keep the answer/confirmation heading visible, not just its final tab row.
      const top = message.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop;
      log.scrollTop = Math.min(top, log.scrollHeight - log.clientHeight);
    }
    return message;
  }

  function appendTabs(parent, tabs, label) {
    if (!tabs?.length) return;
    if (label) parent.append(element('p', 'tab-chat-list-label', label));
    const list = element('ul', 'tab-chat-tabs');
    parent.append(list);
    function appendRows(from, to) {
      let first;
      for (let i = from; i < to; i++) {
        const tab = tabs[i];
        const row = element('li');
        const focus = button('', 'chat-focus-tab');
        focus.className = 'tab-chat-tab';
        focus.append(element('span', 'tab-chat-tab-title', tab.title || 'Untitled tab'));
        focus.append(element('span', 'tab-chat-tab-url', tab.url || 'URL unavailable'));
        focus.append(element('span', 'tab-chat-tab-meta', `Window ${tab.windowId}${tab.pinned ? ' · Pinned' : ''}${tab.pendingUrl ? ' · Navigating' : ''}`));
        references.set(focus, tab);
        row.append(focus);
        list.append(row);
        if (!first) first = focus;
      }
      return first;
    }
    appendRows(0, Math.min(5, tabs.length));
    if (tabs.length > 5) {
      const expand = button(`Show all ${tabs.length}`, 'chat-show-all');
      expansions.set(expand, () => {
        const first = appendRows(5, tabs.length);
        expand.remove();
        syncControls();
        first?.focus();
      });
      parent.append(expand);
    }
  }

  function appendExclusions(parent, excluded) {
    if (!excluded?.length) return;
    const reasons = new Map();
    for (const item of excluded) reasons.set(item.reason, (reasons.get(item.reason) || 0) + 1);
    const list = element('ul', 'tab-chat-exclusions');
    for (const [reason, count] of reasons) list.append(element('li', '', `${count} kept: ${reason}`));
    parent.append(list);
  }

  function invalidateProposal(text = 'Canceled. No close request was sent.') {
    if (!pending) return;
    for (const el of pending.controls) el.disabled = true;
    pending.note.textContent = text;
    pending = null;
  }

  function destroyModel() {
    workingSession?.destroy();
    workingSession = null;
    baseSession?.destroy();
    baseSession = null;
  }

  function stopWork(message) {
    if (busy === 'close' || busy === 'focus') return;
    generation++;
    controller?.abort();
    controller = null;
    destroyModel();
    busy = null;
    showProgress(false);
    status.textContent = message;
    syncControls();
  }

  function begin(kind) {
    busy = kind;
    controller = new AbortController();
    const token = ++generation;
    syncControls();
    return { token, signal: controller.signal };
  }

  function finish(token) {
    if (token !== generation) return;
    busy = null;
    controller = null;
    showProgress(false);
    syncControls();
  }

  function failureText(error) {
    if (error.name === 'QuotaExceededError') return 'That request is too long for local AI. Try a shorter request.';
    if (error.name === 'NotSupportedError') {
      availability = 'unavailable';
      return "Local AI isn't available for this request in this Chrome profile.";
    }
    if (error.name === 'NotAllowedError') {
      availability = 'downloadable';
      return 'Choose Set up local AI to start a new session with a direct click.';
    }
    if (error instanceof SyntaxError) return 'Local AI returned an invalid request. Try rephrasing it.';
    return error.message || 'Could not complete that request. Try again.';
  }

  async function checkAvailability() {
    if (busy) return;
    const { token } = begin('checking');
    status.textContent = 'Checking local AI…';
    try {
      const supported = typeof globalThis.LanguageModel?.availability === 'function' && typeof globalThis.LanguageModel?.create === 'function';
      const state = supported ? await LanguageModel.availability(modelOptions) : 'unavailable';
      if (token !== generation) return;
      availability = ['available', 'downloadable', 'downloading'].includes(state) ? state : 'unavailable';
      status.textContent = availability === 'available' ? 'Local AI is ready. What would you like to know?'
        : availability === 'downloadable' ? 'Chrome needs to download a model before chat works. Requests and tab data stay on this device.'
        : availability === 'downloading' ? 'Chrome is downloading the local model. Continue setup to follow its progress.'
        : "Local AI isn't available in this Chrome profile. Your dashboard controls still work.";
    } catch (error) {
      if (token !== generation) return;
      availability = 'unavailable';
      status.textContent = failureText(error);
    } finally { finish(token); }
  }

  async function createBaseSession(signal) {
    // Called directly from Send or Setup, before any tab reads consume activation.
    const session = await LanguageModel.create({
      ...modelOptions,
      initialPrompts: [{ role: 'system', content: systemPrompt }],
      signal,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', event => {
          if (signal.aborted) return;
          showProgress(true);
          progress.value = event.loaded;
          status.textContent = event.loaded < 1 ? `Downloading local AI… ${Math.round(event.loaded * 100)}%` : 'Preparing local AI…';
          if (event.loaded >= 1) progress.removeAttribute('value');
        });
      },
    });
    if (signal.aborted) {
      session.destroy();
      signal.throwIfAborted();
    }
    baseSession = session;
    return session;
  }

  async function interpretTabRequest(text, priorIntent, hasPreviousSelection, signal) {
    const base = baseSession || await createBaseSession(signal);
    signal.throwIfAborted();
    const session = await base.clone({ signal });
    try {
      signal.throwIfAborted();
      workingSession = session;
      const response = await session.prompt(JSON.stringify({ request: text, previousIntent: priorIntent, hasPreviousSelection }), {
        responseConstraint: TAB_CHAT_INTENT_SCHEMA,
        signal,
      });
      signal.throwIfAborted();
      return validateTabChatIntent(JSON.parse(response));
    } finally {
      session.destroy();
      if (workingSession === session) workingSession = null;
    }
  }

  async function startSetup() {
    if (busy) return;
    if (availability !== 'downloadable' && availability !== 'downloading') return checkAvailability();
    if (!navigator.userActivation.isActive) {
      status.textContent = 'Click Set up local AI to allow Chrome to prepare the model.';
      return;
    }
    const { token, signal } = begin('setup');
    status.textContent = 'Preparing local AI…';
    showProgress(true);
    progress.removeAttribute('value');
    try {
      await createBaseSession(signal);
      if (token !== generation) return;
      availability = 'available';
      status.textContent = 'Local AI is ready. You can now send your request.';
    } catch (error) {
      if (token !== generation || error.name === 'AbortError') return;
      destroyModel();
      status.textContent = failureText(error);
    } finally { finish(token); }
  }

  function showResult(result) {
    addMessage('assistant', result.text, message => {
      if (result.kind === 'proposal') {
        const proposal = result.proposal;
        const closeLabel = `Close ${proposal.targets.length} tab${proposal.targets.length === 1 ? '' : 's'}`;
        message.append(element('h3', 'tab-chat-confirm-title', `${closeLabel}?`));
        appendTabs(message, proposal.targets, 'To close');
        appendTabs(message, proposal.keepers, 'Keeping');
        appendExclusions(message, result.excluded);
        const actions = element('div', 'tab-chat-actions');
        const confirm = button(closeLabel, 'chat-confirm-close');
        confirm.classList.add('tab-chat-confirm');
        const cancel = button('Cancel', 'chat-cancel-close');
        actions.append(confirm, cancel);
        const note = element('p', 'tab-chat-note', 'Review these exact tabs. Sending another request replaces this preview.');
        message.append(actions, note);
        pending = { proposal, controls: [confirm, cancel], note };
      } else if (result.kind === 'results') {
        appendTabs(message, result.tabs);
        appendTabs(message, result.keepers, 'Keeping');
        appendExclusions(message, result.excluded);
      } else if (result.choices) {
        const actions = element('div', 'tab-chat-actions');
        for (const choice of result.choices) {
          const el = button(choice.label, 'chat-choose-scope');
          choices.set(el, choice.intent);
          actions.append(el);
        }
        message.append(actions);
      }
    });
    syncControls();
  }

  async function resolveAndShow(intent, token) {
    const result = await resolveTabChatRequest(intent, previousSelection);
    if (token !== generation) return;
    if (result.snapshot) await renderDashboard(result.snapshot);
    if (token !== generation) return;
    previousIntent = intent;
    if (result.kind === 'results' && intent.action !== 'close') previousSelection = result.selection;
    showResult(result);
    status.textContent = '';
    if (intent.action === 'focus' && result.tabs?.length === 1) {
      busy = 'focus';
      syncControls();
      await focusTabExact(result.tabs[0]);
    }
  }

  async function submitRequest(text) {
    if (busy || availability !== 'available') return;
    if (!text.trim() || text.length > 2000) {
      status.textContent = text.length > 2000 ? 'Keep requests under 2,000 characters.' : 'Enter a question or tab request.';
      return;
    }
    invalidateProposal('Replaced by a newer request. No close request was sent.');
    addMessage('user', text.trim());
    input.value = '';
    const { token, signal } = begin('request');
    status.textContent = 'Understanding your request…';
    try {
      const intent = await interpretTabRequest(text.trim(), previousIntent, Boolean(previousSelection), signal);
      if (token !== generation) return;
      await resolveAndShow(intent, token);
    } catch (error) {
      if (token !== generation || error.name === 'AbortError') return;
      destroyModel();
      addMessage('assistant', failureText(error));
      status.textContent = '';
    } finally { finish(token); }
  }

  async function runChoice(intent, label) {
    if (busy) return;
    invalidateProposal();
    addMessage('user', label);
    const { token } = begin('request');
    try { await resolveAndShow(intent, token); } catch (error) {
      if (token === generation) addMessage('assistant', failureText(error));
    } finally { finish(token); }
  }

  async function confirmClose(el) {
    if (busy || !pending || pending.controls[0] !== el) return;
    const current = pending;
    pending = null;
    for (const control of current.controls) control.disabled = true;
    current.note.textContent = 'Closing the confirmed selection…';
    previousSelection = null;
    const { token } = begin('close');
    status.textContent = 'Closing confirmed tabs…';
    try {
      const result = await executeTabCloseProposal(current.proposal);
      current.note.textContent = 'This confirmation has been used.';
      addMessage('assistant', tabCloseResultText(result));
    } catch (error) {
      current.note.textContent = 'This preview is no longer executable.';
      addMessage('assistant', failureText(error));
    } finally {
      status.textContent = '';
      finish(token);
    }
  }

  async function focusResult(reference) {
    if (busy) return;
    const { token } = begin('focus');
    try { await focusTabExact(reference); } catch (error) {
      addMessage('assistant', failureText(error));
    } finally { finish(token); }
  }

  function collapse() {
    invalidateProposal();
    stopWork('');
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }

  toggle.addEventListener('click', () => {
    if (!panel.hidden) return collapse();
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    (availability === 'available' || availability === 'unchecked' ? input : setup).focus();
    checkAvailability();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    submitRequest(input.value);
  });
  panel.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      collapse();
    } else if (event.target === input && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  panel.addEventListener('click', event => {
    const el = event.target.closest('button[data-action]');
    if (!el || !panel.contains(el) || el.disabled) return;
    switch (el.dataset.action) {
      case 'chat-example':
        input.value = el.dataset.prompt;
        input.focus();
        break;
      case 'chat-show-all': expansions.get(el)?.(); break;
      case 'chat-focus-tab': focusResult(references.get(el)); break;
      case 'chat-choose-scope': runChoice(choices.get(el), el.textContent); break;
      case 'chat-confirm-close': confirmClose(el); break;
      case 'chat-cancel-close':
        if (pending?.controls.includes(el)) { invalidateProposal(); input.focus(); }
        break;
    }
  });
  setup.addEventListener('click', startSetup);
  stop.addEventListener('click', () => stopWork('Stopped. No close request was sent.'));
  clear.addEventListener('click', () => {
    if (busy === 'close' || busy === 'focus') return;
    invalidateProposal();
    stopWork('Chat cleared.');
    previousIntent = null;
    previousSelection = null;
    input.value = '';
    log.replaceChildren();
    examples.hidden = false;
    input.focus();
  });
  window.addEventListener('pagehide', () => {
    generation++;
    controller?.abort();
    destroyModel();
    pending = null;
  });
  syncControls();
})();

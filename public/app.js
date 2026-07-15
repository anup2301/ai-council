(function () {
  'use strict';

  const form          = document.getElementById('ask-form');
  const textarea      = document.getElementById('question-input');
  const charCounter   = document.getElementById('char-counter');
  const submitBtn     = document.getElementById('submit-btn');
  const btnText       = submitBtn.querySelector('.btn-text');
  const loadingSection  = document.getElementById('loading-section');
  const thinkingStatus  = document.getElementById('thinking-status');
  const answerSection   = document.getElementById('answer-section');
  const answerText      = document.getElementById('answer-text');
  const cacheBadge      = document.getElementById('cache-badge');
  const errorSection    = document.getElementById('error-section');
  const errorMessage    = document.getElementById('error-message');
  const askAnotherBtn   = document.getElementById('ask-another-btn');
  const copyBtn         = document.getElementById('copy-btn');
  const errorRetryBtn   = document.getElementById('error-retry-btn');
  const exampleChips    = document.querySelectorAll('.example-chip');

  let currentAnswer = '';
  let isLoading = false;

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    const max = parseInt(textarea.getAttribute('maxlength'), 10);
    charCounter.textContent = `${len} / ${max}`;
    charCounter.className = 'char-counter' +
      (len > max * 0.9 ? ' danger' : len > max * 0.75 ? ' warn' : '');
  });

  exampleChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      textarea.value = chip.dataset.q;
      textarea.dispatchEvent(new Event('input'));
      textarea.focus();
    });
  });

  const statusMessages = [
    'Gathering perspectives…',
    'Consulting the council…',
    'Weighing the evidence…',
    'Forging consensus…',
    'Almost there…',
  ];
  let statusInterval = null;
  let statusIdx = 0;

  function startStatusCycle() {
    statusIdx = 0;
    thinkingStatus.textContent = statusMessages[0];
    statusInterval = setInterval(() => {
      statusIdx = (statusIdx + 1) % statusMessages.length;
      thinkingStatus.style.opacity = '0';
      setTimeout(() => {
        thinkingStatus.textContent = statusMessages[statusIdx];
        thinkingStatus.style.opacity = '1';
      }, 300);
    }, 2800);
  }

  function stopStatusCycle() {
    if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }
  }

  function showLoading() {
    hideAll();
    loadingSection.classList.remove('hidden');
    submitBtn.disabled = true;
    btnText.textContent = 'Deliberating…';
    startStatusCycle();
    isLoading = true;
  }

  function showAnswer(answer, cached) {
    hideAll();
    stopStatusCycle();
    currentAnswer = answer;
    cacheBadge.textContent = cached ? '⚡ Served from cache' : 'Synthesized by the Council';
    answerText.textContent = '';
    answerText.classList.add('typing');
    answerSection.classList.remove('hidden');
    let i = 0;
    const speed = Math.max(8, Math.min(18, Math.floor(1500 / answer.length)));
    function typeChar() {
      if (i < answer.length) {
        answerText.textContent += answer[i++];
        setTimeout(typeChar, speed);
      } else {
        answerText.classList.remove('typing');
      }
    }
    setTimeout(typeChar, 300);
    resetSubmitBtn();
    isLoading = false;
  }

  function showError(msg) {
    hideAll();
    stopStatusCycle();
    errorMessage.textContent = msg || 'Something went wrong. Please try again.';
    errorSection.classList.remove('hidden');
    resetSubmitBtn();
    isLoading = false;
  }

  function hideAll() {
    loadingSection.classList.add('hidden');
    answerSection.classList.add('hidden');
    errorSection.classList.add('hidden');
  }

  function resetSubmitBtn() {
    submitBtn.disabled = false;
    btnText.textContent = 'Summon the Council';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isLoading) return;
    const question = textarea.value.trim();
    if (!question) { textarea.focus(); return; }
    showLoading();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const res = await fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        let errMsg = 'The council could not reach a verdict. Please try again.';
        try { const body = await res.json(); if (body.error) errMsg = body.error; } catch (_) {}
        showError(errMsg);
        return;
      }
      const data = await res.json();
      // Only consume `answer` and `cached` — never expose other fields
      if (!data.answer) { showError('Received an empty verdict from the council.'); return; }
      showAnswer(data.answer, !!data.cached);
    } catch (err) {
      if (err.name === 'AbortError') {
        showError('The council took too long to respond. Please try again.');
      } else {
        showError('Network error. Please check your connection and try again.');
      }
    }
  });

  askAnotherBtn.addEventListener('click', () => {
    hideAll();
    textarea.value = '';
    charCounter.textContent = '0 / 800';
    charCounter.className = 'char-counter';
    textarea.focus();
  });

  errorRetryBtn.addEventListener('click', () => {
    hideAll();
    if (textarea.value.trim()) form.dispatchEvent(new Event('submit'));
  });

  copyBtn.addEventListener('click', async () => {
    if (!currentAnswer) return;
    try {
      await navigator.clipboard.writeText(currentAnswer);
      copyBtn.classList.add('copied');
      const span = copyBtn.querySelector('span');
      span.textContent = 'Copied!';
      setTimeout(() => { copyBtn.classList.remove('copied'); span.textContent = 'Copy'; }, 2000);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = currentAnswer;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  });

  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });
})();

/* ─── Runtime State · Shared JS ─── */

/* Ambient dust — texture, not a feature.
   Runs on any page with a <canvas id="bg-canvas">. */
(function initDust() {
  var c = document.getElementById('bg-canvas');
  if (!c) return;
  var ctx = c.getContext('2d');
  if (!ctx) return;
  var W, H;
  function resize() { W = c.width = innerWidth; H = c.height = innerHeight; }
  resize();
  addEventListener('resize', resize);

  var dots = [];
  for (var i = 0; i < 35; i++) {
    dots.push({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 0.08,
      vy: (Math.random() - 0.5) * 0.08,
      s: Math.random() * 0.8 + 0.2
    });
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    var light = document.documentElement.classList.contains('light-mode');
    ctx.fillStyle = light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.15)';
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0 || d.x > W) d.vx *= -1;
      if (d.y < 0 || d.y > H) d.vy *= -1;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.s, 0, 6.28); ctx.fill();
    }
    requestAnimationFrame(loop);
  }
  /* Only run if user hasn't requested reduced motion */
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    loop();
  }
})();

/* Theme toggle — follows system by default, manual pick persists to localStorage.
   Initial class is set by the inline boot script in each page <head>. */
(function initThemeToggle() {
  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: light)');

  function syncLabel() {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.textContent = root.classList.contains('light-mode') ? 'Dark Mode' : 'Light Mode';
  }

  function applyLight(light) {
    root.classList.toggle('light-mode', light);
    syncLabel();
    document.dispatchEvent(new CustomEvent('themechange', { detail: { light: light } }));
  }

  syncLabel();

  var btn = document.getElementById('themeToggle');
  if (btn) {
    btn.addEventListener('click', function () {
      var nextLight = !root.classList.contains('light-mode');
      applyLight(nextLight);
      try { localStorage.setItem('theme', nextLight ? 'light' : 'dark'); } catch (e) {}
    });
  }

  /* React to OS theme changes only if the user hasn't made an explicit choice. */
  var onSystemChange = function (e) {
    var stored;
    try { stored = localStorage.getItem('theme'); } catch (err) {}
    if (!stored) applyLight(e.matches);
  };
  if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
  else if (mq.addListener) mq.addListener(onSystemChange);
})();

/* Share bar — wires Twitter/X, LinkedIn, Facebook, and copy-link buttons on any page with a .share-bar. */
(function initShare() {
  var bars = document.querySelectorAll('.share-bar');
  if (!bars.length) return;

  var canonical = document.querySelector('link[rel="canonical"]');
  var shareUrl = canonical && canonical.href ? canonical.href : location.href;
  var rawTitle = document.title || '';
  var shareTitle = rawTitle.split(' · ')[0].trim() || rawTitle;

  var endpoints = {
    twitter: 'https://x.com/intent/post?url=' + encodeURIComponent(shareUrl)
      + '&text=' + encodeURIComponent(shareTitle) + '&via=runtimestate',
    linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(shareUrl),
    facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(shareUrl)
  };

  function openShare(url) {
    window.open(url, 'share', 'noopener,noreferrer,width=600,height=520');
  }

  function copyLink(btn) {
    var originalLabel = btn.getAttribute('aria-label') || 'Copy link';
    var done = function () {
      btn.classList.add('copied');
      btn.setAttribute('aria-label', 'Link copied');
      setTimeout(function () {
        btn.classList.remove('copied');
        btn.setAttribute('aria-label', originalLabel);
      }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(done, function () {
        fallbackCopy(shareUrl, done);
      });
    } else {
      fallbackCopy(shareUrl, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  Array.prototype.forEach.call(bars, function (bar) {
    var buttons = bar.querySelectorAll('[data-share]');
    Array.prototype.forEach.call(buttons, function (btn) {
      var kind = btn.getAttribute('data-share');
      if (kind === 'copy') {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          copyLink(btn);
        });
      } else if (endpoints[kind]) {
        btn.setAttribute('href', endpoints[kind]);
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          openShare(endpoints[kind]);
        });
      }
    });
  });
})();

/* TTS — works on any page with #playAudioBtn + #tts-subtitles + #blogpost .prose p */
(function initTTS() {
  var playBtn = document.getElementById('playAudioBtn');
  var subDiv = document.getElementById('tts-subtitles');
  if (!playBtn || !subDiv) return;
  if (!('speechSynthesis' in window)) {
    playBtn.querySelector('span').textContent = 'Not supported';
    return;
  }

  var isPlaying = false;
  var voices = [];
  function loadVoices() { voices = window.speechSynthesis.getVoices(); }
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;

  playBtn.addEventListener('click', function () {
    if (isPlaying) {
      window.speechSynthesis.cancel();
      isPlaying = false;
      playBtn.querySelector('span').textContent = 'Listen to Summary';
      playBtn.querySelector('svg').innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
      subDiv.style.opacity = '0';
      subDiv.style.transform = 'translateY(10px)';
      setTimeout(function () { subDiv.innerHTML = ''; }, 400);
      return;
    }

    /* Gather text: prefer #blogpost .prose p, fallback to data-tts-text attribute, fallback to window.__TTS_TEXT */
    var paragraphs = [];
    var blog = document.getElementById('blogpost');
    if (blog) {
      var ps = blog.querySelectorAll('.prose p');
      for (var i = 0; i < ps.length; i++) paragraphs.push(ps[i].innerText);
    }
    if (!paragraphs.length && window.__TTS_TEXT) paragraphs = [window.__TTS_TEXT];
    if (!paragraphs.length) return;

    var fullText = paragraphs.join(' ');
    var sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];

    isPlaying = true;
    playBtn.querySelector('span').textContent = 'Stop Listening';
    playBtn.querySelector('svg').innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';

    var pref = voices.find(function (v) { return /en-(GB|ZA)/i.test(v.lang) && /Google|Natural|Premium/.test(v.name); })
      || voices.find(function (v) { return /^en/.test(v.lang); });

    for (var i = 0; i < sentences.length; i++) {
      (function (idx) {
        var s = sentences[idx].trim();
        if (!s) return;
        var u = new SpeechSynthesisUtterance(s);
        if (pref) u.voice = pref;
        u.rate = 0.95; u.pitch = 1;
        u.onstart = function () {
          if (isPlaying) {
            subDiv.innerHTML = '<span>' + s + '</span>';
            subDiv.style.opacity = '1';
            subDiv.style.transform = 'translateY(0)';
          }
        };
        if (idx === sentences.length - 1) {
          u.onend = function () {
            isPlaying = false;
            playBtn.querySelector('span').textContent = 'Listen to Summary';
            playBtn.querySelector('svg').innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
            subDiv.style.opacity = '0';
            subDiv.style.transform = 'translateY(10px)';
            setTimeout(function () { subDiv.innerHTML = ''; }, 400);
          };
        }
        window.speechSynthesis.speak(u);
      })(i);
    }
  });
})();

/* IntersectionObserver — fade in pillar cards */
(function initPillarObserver() {
  var cards = document.querySelectorAll('.pillar-card');
  if (!cards.length) return;
  if (!('IntersectionObserver' in window)) {
    /* Fallback: show all */
    for (var i = 0; i < cards.length; i++) cards[i].classList.add('in-view');
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) e.target.classList.add('in-view');
    });
  }, { threshold: 0.2 });
  cards.forEach(function (el) { io.observe(el); });
})();

/* UI interactions — tabs, accordions, filters */
(function initUI() {
  /* Tabs */
  document.querySelectorAll('.tab-bar').forEach(function (bar) {
    bar.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var parent = bar.parentElement;
        bar.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
        parent.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        var panel = document.getElementById(btn.getAttribute('data-tab'));
        if (panel) panel.classList.add('active');
      });
    });
  });

  /* Accordions */
  document.querySelectorAll('.acc-header').forEach(function (el) {
    el.addEventListener('click', function () { this.parentElement.classList.toggle('open'); });
  });

  /* Matrix filter */
  document.querySelectorAll('#filterBar .filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#filterBar .filter-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var f = btn.getAttribute('data-filter');
      var table = document.querySelector('.matrix');
      var pieChart = document.getElementById('overallChartView');
      if (f === 'overall') {
        if (table) table.style.display = 'none';
        if (pieChart) { pieChart.style.display = 'flex'; }
      } else {
        if (pieChart) pieChart.style.display = 'none';
        if (table) table.style.display = 'table';
        document.querySelectorAll('.matrix tbody tr').forEach(function (row) {
          row.style.display = (f === 'all' || row.getAttribute('data-cat') === f) ? '' : 'none';
        });
      }
    });
  });

  /* Pie chart interactivity */
  var pieExplanations = {
    'imported': { title: 'Imported / Performative', text: 'These policies predominantly lift international blueprints or propose institutional regulations focused on appearances, critically lacking the implementation capability required for local execution.', color: 'var(--tag-imported)' },
    'adapted': { title: 'Adapted', text: 'Framework elements that borrow significantly from global consensus but successfully adjust specific execution parameters, such as risk thresholds, to align with South African structural realities.', color: 'var(--tag-adapted)' },
    'grounded': { title: 'Grounded', text: 'Policies built authentically from deep local conditions, directly addressing unique socio-technical structural limitations, informal economics, and cultural frameworks like Ubuntu.', color: 'var(--tag-grounded)' },
    'unsaid': { title: 'Ambiguous / Unsaid', text: 'Critical domestic realities completely absent from the national discourse\u2014specifically concerning the systemic electrical grid failures, the unmeasured informal economy, and underlying fiscal feasibility.', color: 'var(--tag-unsaid)' }
  };
  document.querySelectorAll('.pie-segment').forEach(function (seg) {
    seg.addEventListener('click', function () {
      var type = this.getAttribute('data-segment');
      var exp = pieExplanations[type];
      if (!exp) return;
      var expBox = document.getElementById('pieExplanation');
      if (!expBox) return;
      expBox.style.opacity = '0';
      setTimeout(function () {
        expBox.innerHTML = '<strong style="color:' + exp.color + ';display:block;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em;font-size:0.8rem;">' + exp.title + '</strong><span style="color:var(--text-main);">' + exp.text + '</span>';
        expBox.style.opacity = '1';
        expBox.style.borderTop = '2px solid ' + exp.color;
      }, 200);
    });
  });

  /* Incident filter (cyber breaches) */
  var incidentFilter = document.querySelector('[data-incident-filter]');
  if (incidentFilter) {
    var filterButtons = Array.from(incidentFilter.querySelectorAll('.incident-filter-btn'));
    var incidentCards = Array.from(document.querySelectorAll('.incident-card[data-incident-type]'));
    var filterStatus = incidentFilter.querySelector('#incident-filter-status');
    function applyIncidentFilter(type, label) {
      filterButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.filter === type)); });
      incidentCards.forEach(function (c) { c.hidden = !(type === 'all' || c.dataset.incidentType === type); });
      if (filterStatus) filterStatus.textContent = type === 'all' ? 'Showing all dossier entries.' : 'Showing dossier entries for ' + label + '.';
    }
    filterButtons.forEach(function (b) {
      b.addEventListener('click', function () { applyIncidentFilter(b.dataset.filter, b.dataset.filterLabel || b.textContent.trim().toLowerCase()); });
    });
    var defaultBtn = incidentFilter.querySelector('[data-filter="all"]');
    if (defaultBtn) applyIncidentFilter(defaultBtn.dataset.filter, 'all incident types');
  }
})();

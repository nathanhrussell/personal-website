// script.js — theme toggle, reveal on scroll, and contrib graph (with labels)
const root = document.documentElement;
const storageKey = "theme";
const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

function setTheme(theme){
  root.setAttribute("data-theme", theme);
  localStorage.setItem(storageKey, theme);
  const btn = document.getElementById("themeToggle");
  const icon = document.getElementById("themeIcon");
  if(btn && icon){
    btn.setAttribute("aria-pressed", String(theme === "dark"));
    icon.textContent = theme === "dark" ? "☀️" : "🌙";
  }
}

function initTheme(){
  const saved = localStorage.getItem(storageKey);
  setTheme(saved || (prefersDark ? "dark" : "light"));
}

// Utility: run fn now if DOM is ready, otherwise on DOMContentLoaded. This is important because
// the script is injected dynamically (after load/idle) and may miss the DOMContentLoaded event.
function onReady(fn){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
  else fn();
}

onReady(()=>{
  initTheme();
  document.getElementById("themeToggle")?.addEventListener("click", ()=>{
    setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  // Reveal on scroll (lightweight setup)
  const observer = new IntersectionObserver((entries, observer)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        e.target.classList.add('reveal');
        observer.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });

  document.querySelectorAll('[data-reveal]').forEach(el=>{
    el.classList.add('opacity-0','translate-y-6','transition','duration-700');
    observer.observe(el);
  });

  // Defer heavy/non-critical work: contribution graph and large fetches.
  // drawContribGrid will be initialised lazily when the #github-graph enters the viewport.
  function drawContribGrid(){
    // original IIFE body (kept intact) but only executed on demand
    const svg = document.getElementById('contribSVG'); if(!svg) return;
    const cols = 53, rows = 7, size = 10, gap = 2;
    const labelLeft = 28; // space for weekday labels
    const labelTop = 18;  // space for month labels
    const light = ["#ebedf0","#9be9a8","#40c463","#30a14e","#216e39"];
    const dark  = ["#161b22","#0e4429","#006d32","#26a641","#39d353"];
    const palette = ()=> document.documentElement.getAttribute('data-theme') === 'dark' ? dark : light;

    let rects = [];
    let contribGrid = null; // 2D array [col][row]
    let dateGrid = null; // 2D array same shape with ISO dates

    function parseGraphQLCalendar(cal){
      const grid = Array.from({length: cols}, ()=> Array.from({length: rows}, ()=> 0));
      const dates = Array.from({length: cols}, ()=> Array.from({length: rows}, ()=> null));
      if(!cal || !Array.isArray(cal.weeks)) return {grid, dates};
      cal.weeks.forEach((week, wi)=>{
        if(wi>=cols) return;
        week.contributionDays.forEach(day=>{
          const gweekday = (typeof day.weekday === 'number') ? day.weekday : (new Date(day.date).getDay());
          const row = (gweekday + 6) % 7; // Monday -> 0, Sunday -> 6
          grid[wi][row] = day.contributionCount || 0;
          dates[wi][row] = day.date;
        });
      });
      return {grid, dates};
    }

    function parsePerDayList(list){
      const map = new Map();
      list.forEach(d=> map.set(d.date, Number(d.count ?? d.contributionCount ?? 0)));
      const today = new Date();
      const end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
      const totalDays = cols * rows; // 371
      const startDate = new Date(end);
      startDate.setUTCDate(end.getUTCDate() - (totalDays - 1));
      const weekday = startDate.getUTCDay();
      const shift = (weekday === 0) ? -6 : (1 - weekday);
      startDate.setUTCDate(startDate.getUTCDate() + shift);

      const grid = Array.from({length: cols}, ()=> Array.from({length: rows}, ()=> 0));
      const dates = Array.from({length: cols}, ()=> Array.from({length: rows}, ()=> null));
      for(let c=0;c<cols;c++){
        for(let r=0;r<rows;r++){
          const d = new Date(startDate);
          d.setUTCDate(startDate.getUTCDate() + (c*7 + r));
          const iso = d.toISOString().slice(0,10);
          grid[c][r] = Number(map.get(iso) || 0);
          dates[c][r] = iso;
        }
      }
      return {grid, dates};
    }

    // Fixed thresholds tuned for personal contributions
    function countsToBuckets(grid){
      const t = {b1:2, b2:5, b3:15};
      return grid.map(col => col.map(v=>{
        const n = Number(v||0);
        if(n === 0) return 0;
        if(n <= t.b1) return 1;
        if(n <= t.b2) return 2;
        if(n <= t.b3) return 3;
        return 4;
      }));
    }

    function monthLabelsFromDates(dates){
      const months = new Map();
      for(let c=0;c<cols;c++){
        for(let r=0;r<rows;r++){
          const d = dates[c] && dates[c][r];
          if(!d) continue;
          const dt = new Date(d + 'T00:00:00Z');
          const key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}`;
          if(!months.has(key)) months.set(key, {col: c, date: dt});
        }
      }
      
      // Sort months by column and only filter if they're too close (less than 2 columns apart)
      const sortedMonths = Array.from(months.values()).sort((a,b)=> a.col - b.col);
      const filteredMonths = [];
      let lastCol = -1;
      
      for(const month of sortedMonths){
        // Only skip if labels would be closer than 2 columns (about 14 days) apart
        if(month.col - lastCol >= 2 || lastCol === -1){
          filteredMonths.push(month);
          lastCol = month.col;
        }
      }
      
      return filteredMonths;
    }

    function draw(gridBuckets){
      svg.innerHTML = '';
      rects = [];
      const p = palette();
      const width = labelLeft + cols * (size + gap) - gap;
      const height = labelTop + rows * (size + gap) - gap;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

      // month labels
      if(dateGrid){
        const months = monthLabelsFromDates(dateGrid);
        months.forEach(m=>{
          const text = document.createElementNS('http://www.w3.org/2000/svg','text');
          text.setAttribute('x', String(labelLeft + m.col*(size+gap)));
          text.setAttribute('y', String(12));
          text.setAttribute('font-size', '10');
          text.setAttribute('fill', 'currentColor');
          text.textContent = m.date.toLocaleString(undefined, { month: 'short' });
          svg.appendChild(text);
        });
      }

      // weekday labels (left)
      const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      for(let r=0;r<rows;r++){
        if(r % 2 !== 0) continue; // show Mon, Wed, Fri only for compactness
        const y = labelTop + r*(size+gap) + (size/2) + 3;
        const text = document.createElementNS('http://www.w3.org/2000/svg','text');
        text.setAttribute('x', String(2));
        text.setAttribute('y', String(y));
        text.setAttribute('font-size', '10');
        text.setAttribute('fill', 'currentColor');
        text.textContent = weekdays[r];
        svg.appendChild(text);
      }

      // squares
      for(let c=0;c<cols;c++){
        for(let r=0;r<rows;r++){
          const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
          rect.setAttribute('x', String(labelLeft + c*(size+gap)));
          rect.setAttribute('y', String(labelTop + r*(size+gap)));
          rect.setAttribute('width', String(size));
          rect.setAttribute('height', String(size));
          rect.setAttribute('rx','2');
          let fill;
          if(Array.isArray(gridBuckets) && gridBuckets[c] && typeof gridBuckets[c][r] !== 'undefined'){
            const idx = gridBuckets[c][r];
            fill = p[Math.max(0, Math.min(p.length-1, idx))];
          } else {
            const lvl = Math.floor(Math.random()*p.length);
            fill = p[lvl];
          }
          rect.setAttribute('fill', fill);
          rect.style.opacity = '0';
          rect.style.transform = 'scale(.98)';
          rect.style.transformOrigin = 'center';
          // add accessible title/desc
          const title = document.createElementNS('http://www.w3.org/2000/svg','title');
          const date = dateGrid && dateGrid[c] ? dateGrid[c][r] : null;
          title.textContent = `${date || ''}: ${ (Array.isArray(gridBuckets) && gridBuckets[c]) ? (gridBuckets[c][r] || 0) : '0'} contributions`;
          rect.appendChild(title);

          svg.appendChild(rect);
          rects.push(rect);
        }
      }
    }

    function animate(){
      if(!rects.length) return;
      rects.forEach((rect, i)=>{
        setTimeout(()=>{
          rect.style.transition = 'opacity .35s ease, transform .35s ease';
          rect.style.opacity = '1';
          rect.style.transform = 'scale(1)';
        }, i * 12);
      });
    }

    const io = new IntersectionObserver((entries, obs)=>{
      entries.forEach(ent=>{
        if(ent.isIntersecting){
          animate();
          obs.unobserve(ent.target);
        }
      });
    }, { threshold: 0.12 });

    // legend and total rendering
    function renderLegend(total){
      const section = document.getElementById('github-graph');
      if(!section) return;
      let legend = document.getElementById('contribLegend');
      const p = palette();
      if(!legend){
        legend = document.createElement('div');
        legend.id = 'contribLegend';
        legend.className = 'mt-3 text-sm flex items-center gap-3';
        legend.setAttribute('aria-label','Contribution legend');
        const swatchWrap = document.createElement('div');
        swatchWrap.className = 'flex items-center gap-2';
        const labels = ['0','1\u20132','3\u20135','6\u201315','16+'];
        for(let i=0;i<p.length;i++){
          const item = document.createElement('div');
          item.className = 'flex items-center gap-2';
          const sw = document.createElement('span');
          sw.setAttribute('role','img');
          sw.setAttribute('aria-hidden','true');
          sw.style.display = 'inline-block';
          sw.style.width = '14px';
          sw.style.height = '14px';
          sw.style.borderRadius = '3px';
          sw.style.background = p[i];
          item.appendChild(sw);
          const tlabel = document.createElement('span');
          tlabel.textContent = labels[i];
          tlabel.className = 'text-muted';
          item.appendChild(tlabel);
          swatchWrap.appendChild(item);
        }
        legend.appendChild(swatchWrap);
        const totalEl = document.createElement('div');
        totalEl.id = 'contribTotal';
        totalEl.className = 'text-muted ml-4';
        legend.appendChild(totalEl);
        section.appendChild(legend);
      }
      const swatches = legend.querySelectorAll('span[aria-hidden="true"]');
      swatches.forEach((sw,i)=>{ sw.style.background = p[i]; });
      const totalEl = document.getElementById('contribTotal');
      if(totalEl) totalEl.textContent = `Total: ${Number(total||0).toLocaleString()}`;
    }

    // redraw on theme change
    new MutationObserver(()=>{
      const pgrid = contribGrid ? countsToBuckets(contribGrid) : null;
      draw(pgrid);
      renderLegend((window.__contribData && window.__contribData.totalContributions) || null);
      io.observe(svg);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // load data (try repo-root then public/ relative path; use relative paths for GitHub Pages)
    Promise.any([
      fetch('contrib.json').then(r=>r.ok? r.json() : Promise.reject()).catch(()=>Promise.reject()),
      fetch('public/contrib.json').then(r=>r.ok? r.json() : Promise.reject()).catch(()=>Promise.reject())
    ]).then(data=>{
      let parsed = {grid: null, dates: null};
      if(data && data.weeks){
        parsed = parseGraphQLCalendar(data);
        window.__contribData = data;
      } else if(Array.isArray(data)){
        parsed = parsePerDayList(data);
        window.__contribData = { totalContributions: null };
      }
      contribGrid = parsed.grid;
      dateGrid = parsed.dates;
      const pgrid = contribGrid ? countsToBuckets(contribGrid) : null;
      draw(pgrid);
      renderLegend((data && data.totalContributions) || (window.__contribData && window.__contribData.totalContributions) || null);
      io.observe(svg);
    }).catch(()=>{
      draw(null);
      renderLegend(null);
      io.observe(svg);
    });
  }

  // Initialise contribution graph when the section becomes visible. This avoids heavy work on first paint.
  function initContribWhenVisible(){
    const container = document.getElementById('github-graph');
    if(!container) return;
    const alreadyVisible = container.getBoundingClientRect().top < window.innerHeight;
    const run = ()=>{
      if('requestIdleCallback' in window){
        try{ requestIdleCallback(drawContribGrid, {timeout: 1500}); }catch(e){ setTimeout(drawContribGrid, 800); }
      } else {
        setTimeout(drawContribGrid, 800);
      }
    };
    if(alreadyVisible){ run(); return; }
    const io = new IntersectionObserver((entries, obs)=>{
      entries.forEach(ent=>{
        if(ent.isIntersecting){
          run();
          obs.unobserve(ent.target);
        }
      });
    }, { threshold: 0.05 });
    io.observe(container);
  }

  initContribWhenVisible();

  // Contrast check (basic, logs results) - run during idle
  function luminance(r,g,b){
    const a = [r,g,b].map(v=>{ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
    return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
  }
  function hexToRgb(hex){
    const h = hex.replace('#','');
    return [parseInt(h.substring(0,2),16), parseInt(h.substring(2,4),16), parseInt(h.substring(4,6),16)];
  }
  function contrast(hex1,hex2){
    const L1 = luminance(...hexToRgb(hex1));
    const L2 = luminance(...hexToRgb(hex2));
    return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
  }
  const runContrast = ()=>{
    try{
      const style = getComputedStyle(document.documentElement);
      const bg = style.getPropertyValue('--bg').trim() || '#ffffff';
      const text = style.getPropertyValue('--text').trim() || '#111827';
      const ratio = contrast(bg,text);
      console.log('Contrast ratio (text vs bg):', ratio.toFixed(2));
      console.log('WCAG AA (normal text) pass:', ratio>=4.5);
    }catch(e){ console.warn('Contrast check failed', e); }
  };
  if('requestIdleCallback' in window) requestIdleCallback(runContrast, {timeout:2000}); else setTimeout(runContrast, 1200);

  // --- Inspiration modal & quotes (lazy fetch) ---
  // We'll lazy-load the quotes JSON only when the user opens the insp modal.
  const inspHint = document.getElementById('inspHint');
  const modal = document.getElementById('inspoModal');
  const inner = modal && modal.querySelector('.inspo-inner');
  const close = modal && modal.querySelector('.inspo-close');
  const textEl = document.getElementById('inspoText');
  const authorEl = document.getElementById('inspoAuthor');
  let quotes = null; // null means not fetched yet

  function fetchQuotesLazy(){
    if(quotes !== null) return Promise.resolve(quotes);
    // try public first then root
    return Promise.any([
      fetch('public/quotes.json').then(r=> r.ok? r.json() : Promise.reject()).catch(()=>Promise.reject()),
      fetch('quotes.json').then(r=> r.ok? r.json() : Promise.reject()).catch(()=>Promise.reject())
    ]).then(data=>{ quotes = Array.isArray(data) ? data : []; return quotes; }).catch(()=>{ quotes = []; return quotes; });
  }

  function pickRandom(){
    if(!quotes || !quotes.length) return null;
    const last = localStorage.getItem('lastInspo');
    let idx = Math.floor(Math.random()*quotes.length);
    let tries = 0;
    while(quotes[idx] && JSON.stringify(quotes[idx]) === last && tries < 8){
      idx = Math.floor(Math.random()*quotes.length);
      tries++;
    }
    return quotes[idx] || null;
  }

  function openInspo(){
    // ensure quotes are loaded before showing
    fetchQuotesLazy().then(()=>{
      const q = pickRandom();
      if(!q) return;
      textEl.textContent = q.text;
      authorEl.textContent = q.author ? `\u2014 ${q.author}` : '';
      modal.classList.add('open');
      modal.setAttribute('aria-hidden','false');
      document.body.style.overflow = 'hidden';
      close?.focus();
      try{ localStorage.setItem('lastInspo', JSON.stringify(q)); }catch(e){}
      if(!window.matchMedia) {
        launchConfetti();
      } else if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        launchConfetti();
      }
    });
  }

  function closeInspo(){
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
  }

  // keyboard handler: Alt+Q
  document.addEventListener('keydown', (e)=>{
    if(e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'q'){
      e.preventDefault();
      openInspo();
    }
  });

  inspHint?.addEventListener('click', (e)=>{ e.preventDefault(); openInspo(); });
  close?.addEventListener('click', closeInspo);
  modal?.addEventListener('click', (e)=>{ if(e.target === modal) closeInspo(); });
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeInspo(); });

});

// Inspiration easter: Alt+Q shows a random quote from local JSON
// Removed duplicate insp initialiser - quotes are loaded lazily by the main DOMContentLoaded handler above.

// Simple confetti launcher: add colored divs and animate, then remove
function launchConfetti(){
    // Try canvas-confetti loaded dynamically; fall back to DOM confetti
    const tryRun = ()=>{
      if (typeof confetti === 'function') {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ['#60a5fa','#f59e0b','#34d399','#f472b6','#f97316'] });
        return true;
      }
      return false;
    };

    if(tryRun()) return;

    // If not available, attempt to load canvas-confetti from CDN once, then run. Keep this off the critical path.
    if(!window.__confettiLoading){
      window.__confettiLoading = true;
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
      s.async = true;
      s.onload = ()=>{
        tryRun();
      };
      s.onerror = ()=>{
        // last resort: DOM confetti fallback
        runDomConfetti();
      };
      document.head.appendChild(s);
      // also set a timeout to fallback if script stalls
      setTimeout(()=>{ if(!tryRun()) runDomConfetti(); }, 1200);
    } else {
      // another invocation while the script is loading - wait briefly and fallback
      setTimeout(()=>{ if(!tryRun()) runDomConfetti(); }, 600);
    }

    function runDomConfetti(){
      const colors = ['#60a5fa','#f59e0b','#34d399','#f472b6','#f97316'];
      const count = 24;
      for(let i=0;i<count;i++){
        const el = document.createElement('div');
        el.className = 'confetti-piece confetti-anim';
        el.style.background = colors[i % colors.length];
        el.style.left = (10 + Math.random()*80) + 'vw';
        el.style.top = (-5 - Math.random()*10) + 'vh';
        el.style.width = (6 + Math.random()*8) + 'px';
        el.style.height = (10 + Math.random()*10) + 'px';
        el.style.transform = `rotate(${Math.random()*360}deg)`;
        document.body.appendChild(el);
        setTimeout(()=>{ el.remove(); }, 1100 + Math.random()*400);
      }
    }
}

// Read more / Close handlers for blog post
document.addEventListener('DOMContentLoaded', ()=>{
  const read = document.getElementById('readMore');
  const hide = document.getElementById('hideBlog');
  const full = document.getElementById('blog-full');
  const header = document.getElementById('siteHeader');
  function headerHeight(){ return header ? header.getBoundingClientRect().height : 0; }
  if(read && full){
    read.addEventListener('click', (e)=>{
      e.preventDefault();
      full.classList.remove('hidden');
      full.setAttribute('aria-hidden','false');
      const y = full.getBoundingClientRect().top + window.scrollY - headerHeight() - 8;
      window.scrollTo({ top: y, behavior: 'smooth' });
    });
  }
  if(hide && full){
    hide.addEventListener('click', (e)=>{
      e.preventDefault();
      full.classList.add('hidden');
      full.setAttribute('aria-hidden','true');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
});

// Smooth scroll with offset and active nav highlighting
document.addEventListener('DOMContentLoaded', ()=>{
  const header = document.getElementById('siteHeader');
  const navLinks = Array.from(document.querySelectorAll('.nav-link'));
  const sections = navLinks.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const underline = document.getElementById('nav-underline');

  function headerHeight(){ return header ? header.getBoundingClientRect().height : 0; }

  // Set underline to match a given link element
  function setUnderlineForEl(el){
    if (!underline) return;
    if (!el) {
      underline.style.opacity = '0';
      underline.style.width = '0px';
      return;
    }
    const parentRect = underline.parentElement.getBoundingClientRect();
    // Try to measure only the text/content inside the link (so underline sits under text, not the padded pill)
    let linkRect = null;
    try{
      const range = document.createRange();
      const textNode = Array.from(el.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if(textNode){
        range.selectNodeContents(textNode);
        const r = range.getBoundingClientRect();
        if(r && r.width > 0){ linkRect = r; }
      }
    }catch(e){ /* ignore */ }
    if(!linkRect){ linkRect = el.getBoundingClientRect(); }
    underline.style.opacity = '1';
    underline.style.left = (linkRect.left - parentRect.left) + 'px';
    underline.style.width = linkRect.width + 'px';
    // match link color where sensible, fall back to accent
    const color = getComputedStyle(el).color || getComputedStyle(document.documentElement).getPropertyValue('--accent');
    underline.style.background = color;
  }

  // Move underline to currently active link (or first link as fallback)
  function moveUnderline(){
    const active = document.querySelector('.nav-link.active') || navLinks[0];
    setUnderlineForEl(active);
  }

  // Hover/focus interactions: temporarily show underline under hovered/focused link
  navLinks.forEach(a=>{
    a.addEventListener('mouseenter', ()=> setUnderlineForEl(a));
    a.addEventListener('focus', ()=> setUnderlineForEl(a));
    a.addEventListener('mouseleave', ()=> moveUnderline());
    a.addEventListener('blur', ()=> moveUnderline());
  });

  // Adjust scroll to account for header when clicking anchors
  navLinks.forEach(a=>{
    a.addEventListener('click', (e)=>{
      const href = a.getAttribute('href');
      if(href && href.startsWith('#')){
        const target = document.querySelector(href);
        if(target){
          e.preventDefault();
          // mark this link active immediately so the underline persists while we smooth-scroll
          navLinks.forEach(l => l.classList.remove('active'));
          a.classList.add('active');
          moveUnderline();
          const y = target.getBoundingClientRect().top + window.scrollY - headerHeight() - 8;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }
    });
  });

  // Observe sections to toggle active link
  const obs = new IntersectionObserver((entries)=>{
    entries.forEach(ent=>{
      const id = ent.target.id;
      const link = document.querySelector(`.nav-link[href="#${id}"]`);
      if(!link) return;
      if(ent.isIntersecting){
        navLinks.forEach(l=>l.classList.remove('active'));
        link.classList.add('active');
        moveUnderline();
      }
    });
  }, { rootMargin: `-${headerHeight()}px 0px -40% 0px`, threshold: 0.2 });

  sections.forEach(s=>obs.observe(s));

  // On resize, reposition underline
  window.addEventListener('resize', moveUnderline);
  // On load, position underline
  setTimeout(moveUnderline, 80);
});

// Smooth-link handler for manually added inline links (accounts for sticky header)
document.addEventListener('DOMContentLoaded', ()=>{
  const header = document.getElementById('siteHeader');
  function headerHeight(){ return header ? header.getBoundingClientRect().height : 0; }
  document.querySelectorAll('a.smooth-link').forEach(a=>{
    a.addEventListener('click', (e)=>{
      const href = a.getAttribute('href');
      if(!href || !href.startsWith('#')) return;
      const target = document.querySelector(href);
      if(!target) return;
      e.preventDefault();
      const y = target.getBoundingClientRect().top + window.scrollY - headerHeight() - 8;
      window.scrollTo({ top: y, behavior: 'smooth' });
      // after a small delay, focus the target for accessibility
      setTimeout(()=>{ try{ target.setAttribute('tabindex','-1'); target.focus(); target.removeAttribute('tabindex'); }catch(e){} }, 400);
    });
  });
});

// Mockup interactivity: click/tap to cycle images, keyboard support for accessibility
// Image modal (zoom) for mockups
onReady(()=>{
  const modal = document.getElementById('imgModal');
  const modalImg = document.getElementById('imgModalImg');
  const closeBtn = modal && modal.querySelector('.close-btn');
  const prevBtn = modal && modal.querySelector('.modal-nav.prev');
  const nextBtn = modal && modal.querySelector('.modal-nav.next');

  // track the currently-opened container and index so we can navigate
  let activeContainer = null;
  let activeIndex = 0;

  function openModal(src, alt, container, index){
    if(!modal || !modalImg) return;
    modalImg.src = src;
    modalImg.alt = alt || '';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
    activeContainer = container || null;
    activeIndex = Number(index || 0);
    closeBtn?.focus();
  }
  function closeModal(){
    if(!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
    modalImg.src = '';
    activeContainer = null;
    activeIndex = 0;
  }

  function showIndex(container, index){
    container.setAttribute('data-mockup-index', String(index));
  }

  function showModalIndex(delta){
    if(!activeContainer) return;
    const imgs = Array.from(activeContainer.querySelectorAll('img'));
    if(!imgs.length) return;
    activeIndex = (activeIndex + delta + imgs.length) % imgs.length;
    const next = imgs[activeIndex];
    if(next){ modalImg.src = next.src; modalImg.alt = next.alt || ''; }
  }

  // Handle zoom buttons specifically
  document.querySelectorAll('.zoom-btn').forEach(zoom => {
    zoom.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const container = zoom.closest('.mockup');
      if (!container) return;
      
      const imgs = Array.from(container.querySelectorAll('img'));
      let visible = null;
      
      // Get the currently visible image based on the mockup index
      const idx = Number(container.getAttribute('data-mockup-index') || 0);
      visible = imgs[idx] || imgs[0];
      
      if(visible) {
        openModal(visible.src, visible.alt, container, imgs.indexOf(visible));
      }
    });
  });

  // Handle mockup containers for image cycling
  document.querySelectorAll('.mockup').forEach(container=>{
    showIndex(container, Number(container.getAttribute('data-mockup-index')||0));

    // Only cycle images when the container itself (or non-zoom controls) is clicked.
    container.addEventListener('click', (e)=>{
      // If the click originated from the zoom button (or its children), ignore so the zoom handler can run.
      if(e.target.closest && e.target.closest('.zoom-btn')) return;
      const imgs = container.querySelectorAll(':scope > img');
      if(imgs.length<2) return;
      const idx = (Number(container.getAttribute('data-mockup-index')||0) + 1) % imgs.length;
      showIndex(container, idx);
    });

    container.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        container.click();
      }
    });
  });

  // modal controls
  closeBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e)=>{ if(e.target === modal) closeModal(); });

  prevBtn?.addEventListener('click', ()=> showModalIndex(-1));
  nextBtn?.addEventListener('click', ()=> showModalIndex(1));

  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape') return closeModal();
    if(!modal || !modal.classList.contains('open')) return;
    if(e.key === 'ArrowLeft') showModalIndex(-1);
    if(e.key === 'ArrowRight') showModalIndex(1);
  });
});

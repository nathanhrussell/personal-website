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

document.addEventListener("DOMContentLoaded", ()=>{
  initTheme();
  document.getElementById("themeToggle")?.addEventListener("click", ()=>{
    setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  // Reveal on scroll
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

  // Contribution graph — draw 53x7 grid and animate on first intersection. Theme-aware palette and redraw on theme change.
  (function makeContribGrid(){
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
      return Array.from(months.values()).sort((a,b)=> a.col - b.col);
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
        const labels = ['0','1–2','3–5','6–15','16+'];
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

  })();

  // Contrast check (basic, logs results)
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
  try{
    const style = getComputedStyle(document.documentElement);
    const bg = style.getPropertyValue('--bg').trim() || '#ffffff';
    const text = style.getPropertyValue('--text').trim() || '#111827';
    const ratio = contrast(bg,text);
    console.log('Contrast ratio (text vs bg):', ratio.toFixed(2));
    console.log('WCAG AA (normal text) pass:', ratio>=4.5);
  }catch(e){ console.warn('Contrast check failed', e); }

});

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

  function headerHeight(){ return header ? header.getBoundingClientRect().height : 0; }

  // Adjust scroll to account for header when clicking anchors
  navLinks.forEach(a=>{
    a.addEventListener('click', (e)=>{
      const href = a.getAttribute('href');
      if(href && href.startsWith('#')){
        const target = document.querySelector(href);
        if(target){
          e.preventDefault();
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
      }
    });
  }, { rootMargin: `-${headerHeight()}px 0px -40% 0px`, threshold: 0.2 });

  sections.forEach(s=>obs.observe(s));
});

// Mockup interactivity: click/tap to cycle images, keyboard support for accessibility
document.addEventListener('DOMContentLoaded', ()=>{
  function showIndex(container, index){
    container.setAttribute('data-mockup-index', String(index));
  }

  document.querySelectorAll('.mockup').forEach(container=>{
    showIndex(container, Number(container.getAttribute('data-mockup-index')||0));

    // Only cycle images when the container itself (or non-zoom controls) is clicked.
    container.addEventListener('click', (e)=>{
      // If a recent pointerdown on the zoom button set a flag, ignore this click (handles touch where pointerdown happens before click).
      if(container.dataset.__zoom){ delete container.dataset.__zoom; return; }
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
});

// Image modal (zoom) for mockups
document.addEventListener('DOMContentLoaded', ()=>{
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

  // Wire zoom buttons inside mockups
  document.querySelectorAll('.mockup').forEach(container=>{
    const zoom = container.querySelector('.zoom-btn');
    if(!zoom) return;
    // On pointerdown (touch/pointer) mark the container so the following click handler knows to ignore the container click.
    zoom.addEventListener('pointerdown', (ev)=>{
      try{ container.dataset.__zoom = '1'; }catch(e){}
      // clear after a short window
      setTimeout(()=>{ try{ delete container.dataset.__zoom; }catch(e){} }, 400);
    });
    zoom.addEventListener('click', (e)=>{
      e.stopPropagation();
      // find the currently visible image inside container
      const imgs = Array.from(container.querySelectorAll('img'));
      let visible = null;
      // If the user is hovering the container, prefer the hover-visible image (second image in the simple hover-swap pattern)
      try{
        if(container.matches && container.matches(':hover') && imgs.length > 1){
          visible = imgs[1];
        }
      }catch(e){}

      // Otherwise, pick the first image with a computed opacity > 0.01
      if(!visible){
        visible = imgs.find(i=> parseFloat(getComputedStyle(i).opacity || '0') > 0.01);
      }

      // Fallback to the JS-tracked index or the first image
      if(!visible){
        const idx = Number(container.getAttribute('data-mockup-index') || 0);
        visible = imgs[idx] || imgs[0];
      }

      if(visible) openModal(visible.src, visible.alt, container, imgs.indexOf(visible));
    });
  });

  // modal controls
  closeBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e)=>{ if(e.target === modal) closeModal(); });

  function showModalIndex(delta){
    if(!activeContainer) return;
    const imgs = Array.from(activeContainer.querySelectorAll('img'));
    if(!imgs.length) return;
    activeIndex = (activeIndex + delta + imgs.length) % imgs.length;
    const next = imgs[activeIndex];
    if(next){ modalImg.src = next.src; modalImg.alt = next.alt || ''; }
  }

  prevBtn?.addEventListener('click', ()=> showModalIndex(-1));
  nextBtn?.addEventListener('click', ()=> showModalIndex(1));

  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape') return closeModal();
    if(!modal.classList.contains('open')) return;
    if(e.key === 'ArrowLeft') showModalIndex(-1);
    if(e.key === 'ArrowRight') showModalIndex(1);
  });
});

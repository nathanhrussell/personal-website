// script.js — theme toggle, reveal on scroll, and contrib graph
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
    const light = ["#ebedf0","#9be9a8","#40c463","#30a14e","#216e39"];
    const dark  = ["#161b22","#0e4429","#006d32","#26a641","#39d353"];
    const palette = ()=> document.documentElement.getAttribute('data-theme') === 'dark' ? dark : light;

    let rects = [];
    // contribGrid: optional 2D array [col][row] with numeric counts
    let contribGrid = null;

    // helpers: parse GraphQL calendar object (weeks -> contributionDays)
    function parseGraphQLCalendar(cal){
      // expects cal.weeks -> array of weeks; each week.contributionDays -> {date, contributionCount, weekday}
      const grid = Array.from({length: cols}, ()=> Array.from({length: rows}, ()=> 0));
      if(!cal || !Array.isArray(cal.weeks)) return grid;
      cal.weeks.forEach((week, wi)=>{
        if(wi>=cols) return; // ignore extra weeks
        week.contributionDays.forEach(day=>{
          // GraphQL weekday: 0=Sunday, 1=Monday, ... 6=Saturday
          // user requested weeks start on Monday -> map Monday->row 0 ... Sunday->row 6
          const gweekday = (typeof day.weekday === 'number') ? day.weekday : (new Date(day.date).getDay());
          const row = (gweekday + 6) % 7; // Monday=1 -> 0, Sunday=0 -> 6
          grid[wi][row] = day.contributionCount || 0;
        });
      });
      return grid;
    }

    // helper: parse per-day list [{date,count}] into grid with weeks starting Monday and including today
    function parsePerDayList(list){
      // build a map date -> count
      const map = new Map();
      list.forEach(d=> map.set(d.date, Number(d.count ?? d.contributionCount ?? d.count ?? 0)));
      // compute the Monday-starting start date for the 53-week grid that ends today
      const today = new Date();
      // ensure we use user's requested today: include today's date (UTC iso)
      const end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
      // find Monday of the week that contains the start of the 53-week window
      const totalDays = cols * rows; // 371
      const startDate = new Date(end);
      startDate.setUTCDate(end.getUTCDate() - (totalDays - 1));
      // Align startDate to the Monday of its week
      const weekday = startDate.getUTCDay(); // 0=Sunday
      const shift = (weekday === 0) ? -6 : (1 - weekday); // move to Monday
      startDate.setUTCDate(startDate.getUTCDate() + shift);

      const grid = Array.from({length: cols}, ()=> Array.from({length: rows}, ()=> 0));
      for(let c=0;c<cols;c++){
        for(let r=0;r<rows;r++){
          const d = new Date(startDate);
          d.setUTCDate(startDate.getUTCDate() + (c*7 + r));
          const iso = d.toISOString().slice(0,10);
          grid[c][r] = Number(map.get(iso) || 0);
        }
      }
      return grid;
    }

    // Map numeric counts to bucket 0..4 using percentile thresholds on non-zero counts
    function countsToBuckets(grid){
      const flat = [];
      grid.forEach(col=> col.forEach(v=> flat.push(Number(v||0))));
      const nonZero = flat.filter(v=>v>0).sort((a,b)=>a-b);
      if(nonZero.length===0){
        return grid.map(col=> col.map(()=>0));
      }
      function percentile(arr,p){
        const idx = Math.floor(p*(arr.length-1));
        return arr[Math.max(0, Math.min(arr.length-1, idx))];
      }
      const t1 = percentile(nonZero, 0.20);
      const t2 = percentile(nonZero, 0.50);
      const t3 = percentile(nonZero, 0.80);
      return grid.map(col => col.map(v=>{
        const n = Number(v||0);
        if(n===0) return 0;
        if(n <= t1) return 1;
        if(n <= t2) return 2;
        if(n <= t3) return 3;
        return 4;
      }));
    }

    function draw(gridBuckets){
      svg.innerHTML = '';
      rects = [];
      const p = palette();
      for(let c=0;c<cols;c++){
        for(let r=0;r<rows;r++){
          const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
          rect.setAttribute('x', String(c*(size+gap)));
          rect.setAttribute('y', String(r*(size+gap)));
          rect.setAttribute('width', String(size));
          rect.setAttribute('height', String(size));
          rect.setAttribute('rx','2');
          // pick fill: if gridBuckets provided, use it, otherwise random
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
          svg.appendChild(rect);
          rects.push(rect);
        }
      }
      const width = cols * (size + gap) - gap;
      const height = rows * (size + gap) - gap;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    function animate(){
      if(!rects.length) return;
      rects.forEach((rect, i)=>{
        setTimeout(()=>{
          rect.style.transition = 'opacity .35s ease, transform .35s ease';
          rect.style.opacity = '1';
          rect.style.transform = 'scale(1)';
        }, i * 20);
      });
    }

    // Intersection observer for first-view animation
    const io = new IntersectionObserver((entries, obs)=>{
      entries.forEach(ent=>{
        if(ent.isIntersecting){
          animate();
          obs.unobserve(ent.target);
        }
      });
    }, { threshold: 0.12 });

    // When theme changes, redraw using the same contributed buckets if available
    new MutationObserver(()=>{
      const pgrid = contribGrid ? countsToBuckets(contribGrid) : null;
      draw(pgrid);
      io.observe(svg);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Try to load public contrib.json (GitHub Actions can produce this at /contrib.json or /public/contrib.json)
    Promise.any([
      fetch('/contrib.json').then(r=>r.ok? r.json() : Promise.reject()).catch(()=>Promise.reject()),
      fetch('/public/contrib.json').then(r=>r.ok? r.json() : Promise.reject()).catch(()=>Promise.reject())
    ]).then(data=>{
      // data may be the contributionCalendar object or the calendar itself
      if(data && data.weeks) {
        contribGrid = parseGraphQLCalendar(data);
      } else if(data && Array.isArray(data.weeks)){
        contribGrid = parseGraphQLCalendar({weeks: data.weeks});
      } else if(Array.isArray(data)){
        // assume per-day list
        contribGrid = parsePerDayList(data);
      }
      const pgrid = contribGrid ? countsToBuckets(contribGrid) : null;
      draw(pgrid);
      io.observe(svg);
    }).catch(()=>{
      // fallback: random demo
      draw(null);
      io.observe(svg);
    });
  })();

  // Contrast check (basic, logs results)
  function luminance(r,g,b){
    const a = [r,g,b].map(v=>{
      v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4);
    });
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
    // Only set the active index as a data attribute. Visual state is handled by CSS
    container.setAttribute('data-mockup-index', String(index));
  }

    document.querySelectorAll('.mockup').forEach(container=>{
      // ensure initial state
    showIndex(container, Number(container.getAttribute('data-mockup-index')||0));

      // click or tap cycles images
      container.addEventListener('click', ()=>{
        const imgs = container.querySelectorAll(':scope > img');
        if(imgs.length<2) return;
        const idx = (Number(container.getAttribute('data-mockup-index')||0) + 1) % imgs.length;
        showIndex(container, idx);
      });

      // keyboard: Enter or Space toggles
      container.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          container.click();
        }
      });
    });
  });

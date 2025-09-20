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
    let contribGrid = null; // 2D array [col][row]

    function parseGraphQLCalendar(cal){
      const grid = Array.from({length: cols}, ()=> Array.from({length: rows}, ()=> 0));
      if(!cal || !Array.isArray(cal.weeks)) return grid;
      cal.weeks.forEach((week, wi)=>{
        if(wi>=cols) return;
        week.contributionDays.forEach(day=>{
          const gweekday = (typeof day.weekday === 'number') ? day.weekday : (new Date(day.date).getDay());
          const row = (gweekday + 6) % 7; // Monday -> 0, Sunday -> 6
          grid[wi][row] = day.contributionCount || 0;
        });
      });
      return grid;
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

    // load data
    Promise.any([
      fetch('/contrib.json').then(r=>r.ok? r.json() : Promise.reject()).catch(()=>Promise.reject()),
      fetch('/public/contrib.json').then(r=>r.ok? r.json() : Promise.reject()).catch(()=>Promise.reject())
    ]).then(data=>{
      if(data && data.weeks){
        contribGrid = parseGraphQLCalendar(data);
        window.__contribData = data;
      } else if(data && Array.isArray(data.weeks)){
        contribGrid = parseGraphQLCalendar({weeks: data.weeks});
        window.__contribData = { totalContributions: data.totalContributions || null };
      } else if(Array.isArray(data)){
        contribGrid = parsePerDayList(data);
        window.__contribData = { totalContributions: null };
      }
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

    container.addEventListener('click', ()=>{
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

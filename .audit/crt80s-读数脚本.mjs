import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 1280, height: 900 } });
    const page = await browser.newPage();
    
    // 1. terminal
    await page.goto('http://127.0.0.1:8784/?skin=terminal&tab=think');
    await page.waitForTimeout(2000);
    let termVals = await page.evaluate(() => {
        let frame = document.querySelector('iframe[src*="frontend-think.html"]').contentWindow.document;
        let p = frame.querySelector('.kami-md p');
        let li = frame.querySelector('.kami-md li');
        let bq = frame.querySelector('.kami-md blockquote');
        let tbl = frame.querySelector('.kami-md table');
        let pre = frame.querySelector('.kami-md pre');
        return {
            p: p ? window.getComputedStyle(p).fontFamily : null,
            liMarker: li ? window.getComputedStyle(li, '::before').content : null,
            bqBorder: bq ? window.getComputedStyle(bq).borderLeft : null,
            tblBorder: tbl ? window.getComputedStyle(tbl).borderCollapse : null,
            preBg: pre ? window.getComputedStyle(pre).backgroundColor : null
        };
    });
    console.log('terminal MD:', termVals);

    // 2. crt80s
    await page.goto('http://127.0.0.1:8784/?skin=crt80s&tab=think');
    await page.waitForTimeout(2000);
    let crtVals = await page.evaluate(() => {
        let anim = window.getComputedStyle(document.querySelector('.kami-surface'), '::before').animation;
        let filter1 = window.getComputedStyle(document.querySelector('.kami-root')).filter;
        
        let frame = document.querySelector('iframe[src*="frontend-think.html"]').contentWindow.document;
        let li = frame.querySelector('.kami-md li');
        let bq = frame.querySelector('.kami-md blockquote');
        let tbl = frame.querySelector('.kami-md table');
        let pre = frame.querySelector('.kami-md pre');
        let md = {
            liMarker: li ? window.getComputedStyle(li, '::marker').color : null,
            bqBorder: bq ? window.getComputedStyle(bq).borderLeft : null,
            tblBorder: tbl ? window.getComputedStyle(tbl.querySelector('td')).border : null,
            preBg: pre ? window.getComputedStyle(pre).backgroundColor : null
        };
        return { anim, filter1, md };
    });
    console.log('crt80s:', crtVals);
    
    // change crt80s hue
    await page.evaluate(() => {
        document.documentElement.style.setProperty('--kami-crt-hue', '90deg');
    });
    await page.waitForTimeout(500);
    let crtFilter2 = await page.evaluate(() => window.getComputedStyle(document.querySelector('.kami-root')).filter);
    console.log('crt80s filter2:', crtFilter2);

    // 3. mileng
    await page.goto('http://127.0.0.1:8784/?skin=mileng&tab=think');
    await page.waitForTimeout(2000);
    let milengVals = await page.evaluate(() => {
        let root = document.querySelector('.kami-shell');
        let head = document.querySelector('.kami-head');
        let clip = window.getComputedStyle(root).boxShadow;
        let transform = window.getComputedStyle(head).textTransform;
        
        let frame = document.querySelector('iframe[src*="frontend-think.html"]').contentWindow.document;
        let li = frame.querySelector('.kami-md li');
        let bq = frame.querySelector('.kami-md blockquote');
        let tbl = frame.querySelector('.kami-md table');
        let pre = frame.querySelector('.kami-md pre');
        let md = {
            liMarker: li ? window.getComputedStyle(li, '::marker').color : null,
            bqBorder: bq ? window.getComputedStyle(bq).borderLeft : null,
            tblBorder: tbl ? window.getComputedStyle(tbl.querySelector('td')).border : null,
            preBg: pre ? window.getComputedStyle(pre).backgroundColor : null
        };
        return { clip, transform, md };
    });
    console.log('mileng:', milengVals);

    await browser.close();
})();

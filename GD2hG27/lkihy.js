    // (c) 2022 bobwinds.com - do not redistribute 
    $const.tlong = 0;
    $const.glat = 0; 
    $processor.init();
    const ra = window.devicePixelRatio;
    const wr = document.querySelector('#w'); // TODO
    const ec = document.querySelector('#e');
    const nc = document.querySelector('#n');
    const te = document.querySelector('#te');
    const cTC = document.querySelector('#ct');
    const cC = document.querySelector('#c');
    const mC = document.querySelector('#m');
    const sC = document.querySelector('#s');
    const lum = new t();
    const terre = ec.getContext('2d');
    const tcdc = cTC.getContext('2d'); 
    const cls = cC.getContext('2d');        
    const mn = mC.getContext('2d');
    const sn = sC.getContext('2d');
    const ni = nc.getContext('2d');
    const tm = te.getContext('2d');
    const p = d3.geoAzimuthalEquidistant();
    const cs = getComputedStyle(ec).width.replace('px', '') * ra;
    const dg = document.querySelector('#about');
    const clsB = document.querySelector('#close>img');
    const ld = document.querySelector('#load-screen');
    var edMg,
        enMg,
        ctMg,
        cMg,
        startDate,
        mMg,
        mnPh,
        ouest = p( [-180, 0] ),
        oost = p( [180, 0]),        
        dis = false; // TODO

    nc.style.filter = 'drop-shadow(0 0 3px)';
    te.style.filter = 'blur(2vh)';

    const lder = {
        c: 0,
        stp: function() {
            this.c++;
            if ( this.c == 4 ) {
                ld.style.display = 'none';
                dis = true;
            }
        }            
    }

    document.querySelectorAll('canvas').forEach(c => {
        c.width = c.height = cs;
    });

    p.rotate([0, -90, 0]);
    p.scale(p.scale() * (cs / (oost[0] - ouest[0])));
    p.translate([cs / 2, cs / 2 * 1.01]);

    function di() { // TODO
        wr.style.display = 'block';
        if ( dis ) {
            return;
        }

        d3.json('./FF2GT/0x2e6389.json')
        .then((base64) => {
            let date = startDate = udt();

            edMg = new Image();
            edMg.src = base64[0];
            edMg.onload = () => {
                terre.drawImage(edMg, 0, 0, cs, cs);
                lder.stp();
            }

            enMg = new Image();
            enMg.src = base64[1];
            enMg.onload = () => {
                drT(date);
                lder.stp();
            }

            drS(date);
            drM(date);               
        });

        d3.json('./FF2GT/0x33e9c6.json')
        .then(base64 => {
            cMg = new Image();
            cMg.src = base64[0];
            cMg.onload = () => {
                let date = udt();
                drC(date);
                lder.stp();
            }

            ctMg = new Image();
            ctMg.src = base64[1];
            ctMg.onload = () => {
                tcdc.filter = 'blur(5px)';
                tcdc.drawImage(ctMg, 0, 0, cs, cs);
                lder.stp();
            }       
        });

    }

    function drT(nT) {
        ni.clearRect(0, 0, cs, cs);
        ni.globalCompositeOperation = 'destination-atop';
        ni.drawImage(enMg, 0, 0, cs, cs);
        bT(nT, 80, 0.7, ni);

        let nC = d3.geoCircle(),
            nP = d3.geoPath(p, ni);

        nC.center(lum.i(lum.h(nT))).radius(80);
        
        tm.clearRect(0, 0, cs, cs);
        let tP = d3.geoPath(p, tm);
        tm.beginPath();
        tm.fillStyle = 'rgba(0,0,0,0.90)';
        nC.radius(93);
        tP(nC());
        tm.fill()            
    }


    function bT(z, f, x, cc) {
        let tCI = d3.geoCircle(),
            tP = d3.geoPath(p, cc);
        
        cc.filter = 'blur(1vh)';
        tCI.center(lum.i(lum.h(z))).radius(f);
        cc.beginPath();
        cc.fillStyle = `rgba(0,0,0,${x})`;
        tP(tCI());
        cc.fill();
        cc.filter = 'none';
    }

    function udt() {
        let d = new Date();
        d.setHours( d.getHours() + d.getTimezoneOffset() / 60 );
        return d;    
    }


    function drS(d) {
        sn.clearRect(0, 0, cs, cs);
        let r = cs / 24,
            [x,y] = p(lum.h(d));
        
        const gdnt = sn.createRadialGradient(x, y, r / 5, x, y, r );
        gdnt.addColorStop( 0, 'rgba(255,255,255,.6)');
        gdnt.addColorStop( .5, 'rgba(255,255,0,0.6)');
        gdnt.addColorStop( 1, 'rgba(255,200,0,0)');

        sn.fillStyle = gdnt;
        sn.beginPath();
        sn.arc( x, y, r, 0, Math.PI * 2);
        sn.fill();
    }

    function drM(d, c) {
        let phase = lum.B(d);
        if ( phase == -1 ) {
            mn.clearRect(0, 0, cs, cs);
            return;
        }

        if ( phase != mnPh ) {
            mnPh = phase;
            d3.json('./FF2GT/0x2e6389.json').then((base64) => {          
                mMg = new Image();
                mMg.src  = base64[2][phase];                
                mMg.onload = () => {
                    drMTC(d, mMg)
                }                
            });  
        } else {
            drMTC(d, mMg, c)
        }      
    }

    function drMTC(d, i) {
        let ss = cs / 15;
        let [x, y] = p(lum.q(d));
        let a = afn(x, y);
        // x-= ss / 1.5; 
        // y-= ss / 2;
        let sms = ss * .84;
        let iw = i.width / (i.height / sms); 

        mn.clearRect(0, 0, cs, cs);
        mn.save();
        mn.translate(x, y);
        mn.rotate(a * (Math.PI / 180));
        mn.drawImage(i, -ss / 2 + ((ss - iw) / 2), -ss / 2 + ((ss -sms) / 2), iw, sms);
        mn.restore();
    }

    function drC(date) {
        cls.clearRect(0, 0, cs, cs);
        bT(date, 93, .95, cls);
        cls.globalCompositeOperation = 'source-out'
        cls.filter = 'drop-shadow(0 0 7px rgba(0,0,0,0.8)) blur(.5px)';
        cls.drawImage(cMg, 0, 0, cs, cs);
    }

    function afn(mx, my) {
        let [cx, cy] = p([0, 90]),
            dx = cx - mx,
            dy = my - cy,
            a = Math.atan2(-dy, dx) *180/Math.PI - 90;
            a = a < 0 ? a + 360: a 
        return a;    
    }

    function mvS() {
        const mn = 1;
        const msc = 41;
        var cpD = new Date(startDate);
        let it = 0;
        let int = setInterval(() => {
            cpD.setUTCMinutes(cpD.getUTCMinutes() + (it == 0 ? 0 : mn));
            drS(cpD);
            drM(cpD);
            drT(cpD);
            drC(cpD);                
            if ( it == 1440 )  {
                clearInterval(int);
                document.querySelector('#x41db4').parentNode.classList.toggle('inactive');            
            }
            it++;
        }, msc);
    }

    document.querySelectorAll('.button img').forEach( button => {
        button.onclick = (e) => { 
            if (e.target.id == 'x41db4') {
                if (e.target.parentNode.classList.contains('inactive')) return;
                mvS();
            } 

            if (e.target.id == 'x8dba2') {
                let con = document.querySelector('#con');
                con.classList.toggle('active');          
                e.target.classList.toggle('rotate');
            } else if (e.target.id == 'x2e6389') {
                dg.classList.toggle('show');
            } else {
                e.target.parentNode.classList.toggle('inactive');
            }       
            
            if (e.target.id == 'x5f0a8c') sC.classList.toggle('inactive');
            if (e.target.id == 'x5c1826') mC.classList.toggle('inactive');
            if (e.target.id == 'x0x269') {
                cTC.classList.toggle('inactive');
                cC.classList.toggle('inactive');
            }
        }
    });

    clsB.onclick = (e) => {
        if ( dg.classList.contains('show') ) dg.classList.toggle('show');
    } 

    window.onkeydown = (e) => {
        if ( e.code === 'Escape' ) clsB.click();
    }

    /*
    if ( window.devicePixelRatio != 1 ) {
        document.querySelectorAll('.button, .button>img').forEach(el => rsz(el));
        rsz(clsB);
    }

    function rsz(el) {
        el.style.width = el.clientWidth * 1.5 + 'px';
        el.style.height = el.clientHeight * 1.5 + 'px';
    }
    */

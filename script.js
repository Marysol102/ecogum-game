const canvas = document.getElementById("juegoCanvas");
const ctx = canvas.getContext("2d");

// --- ASSETS ---
// Los assets base se pre-cargan silenciosamente.
// El personaje elegido se inyecta al pulsar JUGAR.
const assets = {
    fondo:     new Image(),
    fondo2:    new Image(),
    jugador:   new Image(),   // se asigna al arrancar según selección
    jugador2:  new Image(),   // personaje2 pre-cargado
    chicle:    new Image(),
    hoja:      new Image(),
    pajaro:    new Image(),
    caca:      new Image(),
    patinete:  new Image()
};

assets.fondo.src    = 'assets/fondo.png';
assets.fondo2.src   = 'assets/fondo2.png';
assets.jugador.src  = 'assets/personaje.png';
assets.jugador2.src = 'assets/personaje2.png';
assets.chicle.src   = 'assets/chicle.png';
assets.hoja.src     = 'assets/hoja.png';
assets.pajaro.src   = 'assets/pajaro.png';
assets.caca.src     = 'assets/caca.png';
assets.patinete.src = 'assets/patinete.png';

// Imagen del jugador activa (se decide al pulsar Jugar)
let imgJugador = assets.jugador;

// --- AUDIO ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function reproducirSonido(freq, tipo, dur, vol = 0.3, freqFinal = null) {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (freqFinal !== null)
        osc.frequency.linearRampToValueAtTime(freqFinal, audioCtx.currentTime + dur);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + dur);
}

function sonidoChicle()   { reproducirSonido(520, 'square',   0.08, 0.25); }
function sonidoCaida()    { reproducirSonido(220, 'sawtooth', 0.18, 0.2, 80); }
function sonidoHoja()     {
    reproducirSonido(880, 'sine', 0.15, 0.3);
    setTimeout(() => reproducirSonido(1100, 'sine', 0.1, 0.15), 80);
}
function sonidoCaca()     {
    reproducirSonido(300, 'sawtooth', 0.05, 0.4, 80);
    setTimeout(() => reproducirSonido(150, 'sawtooth', 0.12, 0.35, 60), 50);
}
function sonidoGraznido() {
    reproducirSonido(700, 'sawtooth', 0.08, 0.25, 350);
    setTimeout(() => reproducirSonido(600, 'sawtooth', 0.06, 0.18, 280), 100);
}
function sonidoPatinete() {
    reproducirSonido(180, 'sawtooth', 0.12, 0.2, 220);
    setTimeout(() => reproducirSonido(200, 'square', 0.06, 0.1), 120);
}

// --- ESTADO ---
let puntuacion     = 0;
let vidas          = 3;
let juegoTerminado = false;
let juegoIniciado  = false;
let objetos        = [];
let pajaros        = [];
let cacas          = [];
let patinetes      = [];
let nivelDificultad  = 1;
let pajaroActivado   = false;
let patineteActivado = false;
let fondoAlpha       = 0;   // transición fondo2
let intervaloObjetos = null;
let intervaloPajaro  = null;
let intervaloPatinete = null;

// Física de salto
const GRAVEDAD      = 0.6;
const FUERZA_SALTO  = -13;
const SUELO_Y       = 400;

const jugador = {
    x: 170, y: SUELO_Y, ancho: 60, alto: 80,
    vx: 0, vy: 0,
    velocidad: 8,
    movIzq: false, movDer: false,
    enSuelo: true
};

// --- CONTROLES TECLADO ---
window.onkeydown = e => {
    if (e.key === "ArrowLeft")  jugador.movIzq = true;
    if (e.key === "ArrowRight") jugador.movDer = true;
    if (e.key === "ArrowUp" && jugador.enSuelo) saltar();
};
window.onkeyup = e => {
    if (e.key === "ArrowLeft")  jugador.movIzq = false;
    if (e.key === "ArrowRight") jugador.movDer = false;
};

function saltar() {
    jugador.vy = FUERZA_SALTO;
    jugador.enSuelo = false;
}

// --- CONTROLES TÁCTILES ---
let touchStartY = null;

canvas.ontouchstart = e => {
    e.preventDefault();
    touchStartY = e.touches[0].clientY;
    moverConDedo(e);
};
canvas.ontouchmove = e => {
    e.preventDefault();
    const dyCliente = e.touches[0].clientY - touchStartY;
    const rect = canvas.getBoundingClientRect();
    const escala = canvas.height / rect.height;
    const dy = dyCliente * escala;
    if (dy < -40 && jugador.enSuelo) {   // dedo arrastra hacia arriba ≥ 40px
        saltar();
        touchStartY = e.touches[0].clientY; // reset para no re-disparar
    }
    moverConDedo(e);
};
canvas.ontouchend = () => { touchStartY = null; };

function moverConDedo(e) {
    const rect = canvas.getBoundingClientRect();
    let nuevaX = (e.touches[0].clientX - rect.left) * (canvas.width / rect.width) - jugador.ancho / 2;
    jugador.x = Math.max(0, Math.min(canvas.width - jugador.ancho, nuevaX));
}

// --- GENERACIÓN DE OBJETOS ---
function crearObjeto() {
    if (juegoTerminado) return;
    nivelDificultad = 1 + Math.floor(puntuacion / 100) * 0.1;
    const generarIndividual = () => {
        const tipo = Math.random() > 0.85 ? 'hoja' : 'chicle';
        objetos.push({
            x: Math.random() * (canvas.width - 30),
            y: -30, ancho: 25, alto: 25,
            vel: (1 + Math.random()) * nivelDificultad,
            tipo
        });
    };
    generarIndividual();
    if (Math.random() > 0.85) setTimeout(generarIndividual, 150);
}

// --- PÁJARO ---
function crearPajaro() {
    if (juegoTerminado || puntuacion < 1000) return;
    if (Math.random() > 0.55) return;
    const dcha = Math.random() > 0.5;
    const vel  = 1.2 + Math.random();
    pajaros.push({
        x: dcha ? -70 : canvas.width + 10,
        y: 50 + Math.random() * 130,
        ancho: 60, alto: 45,
        vel: dcha ? vel : -vel,
        haciaLaDerecha: dcha,
        framesCacaRestantes: 60 + Math.floor(Math.random() * 80)
    });
    sonidoGraznido();
}

function activarPajaro() {
    if (intervaloPajaro) return;
    intervaloPajaro = setInterval(crearPajaro, 5000);
}

// --- PATINETE ---
function crearPatinete() {
    if (juegoTerminado || puntuacion < 2000) return;
    if (Math.random() > 0.5) return;
    const dcha = Math.random() > 0.5;
    const vel  = 3 + Math.random() * 2;
    patinetes.push({
        x: dcha ? -100 : canvas.width + 10,
        y: SUELO_Y + jugador.alto - 40,   // a ras del suelo del jugador
        ancho: 80, alto: 40,
        vel: dcha ? vel : -vel,
        haciaLaDerecha: dcha
    });
    sonidoPatinete();
}

function activarPatinete() {
    if (intervaloPatinete) return;
    intervaloPatinete = setInterval(crearPatinete, 6000);
}

// --- LEADERBOARD ---
async function guardarPuntuacion(nombre, puntos) {
    try {
        await db.collection("ecogum_leaderboard").add({
            nombre: nombre.trim().toUpperCase(),
            puntuacion: puntos,
            fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.error("Error guardando:", e); }
}

async function cargarRanking() {
    try {
        const snap = await db.collection("ecogum_leaderboard")
            .orderBy("puntuacion", "desc").limit(10).get();
        const lista = document.getElementById("listaRanking");
        lista.innerHTML = "";
        snap.forEach(doc => {
            const d  = doc.data();
            const li = document.createElement("li");
            li.textContent = `${d.nombre} — ${d.puntuacion} pts`;
            lista.appendChild(li);
        });
        document.getElementById("ranking").classList.remove("oculto");
    } catch (e) { console.error("Error cargando ranking:", e); }
}

// --- OVERLAY GAME OVER ---
function mostrarGameOver() {
    document.getElementById("puntuacionFinal").textContent = `Puntuación: ${puntuacion}`;
    document.getElementById("formNombre").classList.remove("oculto");
    document.getElementById("ranking").classList.add("oculto");
    document.getElementById("inputNombre").value = "";
    document.getElementById("overlay").classList.remove("oculto");
    cargarRanking();
}

document.getElementById("btnGuardar").addEventListener("click", async () => {
    const nombre = document.getElementById("inputNombre").value.trim();
    if (!nombre) { document.getElementById("inputNombre").focus(); return; }
    document.getElementById("btnGuardar").disabled = true;
    document.getElementById("btnGuardar").textContent = "Guardando...";
    await guardarPuntuacion(nombre, puntuacion);
    await cargarRanking();
    document.getElementById("formNombre").classList.add("oculto");
    document.getElementById("btnGuardar").disabled = false;
    document.getElementById("btnGuardar").textContent = "💾 Guardar puntuación";
});

document.getElementById("btnReiniciar").addEventListener("click", () => {
    document.getElementById("overlay").classList.add("oculto");
    reiniciar();
});

document.getElementById("inputNombre").addEventListener("input", function () {
    const pos = this.selectionStart;
    this.value = this.value.toUpperCase();
    this.setSelectionRange(pos, pos);
});

// --- REINICIO ---
function reiniciar() {
    puntuacion = 0; vidas = 3; nivelDificultad = 1; fondoAlpha = 0;
    objetos = []; pajaros = []; cacas = []; patinetes = [];
    pajaroActivado = false; patineteActivado = false;
    jugador.x = 170; jugador.y = SUELO_Y; jugador.vy = 0; jugador.enSuelo = true;
    juegoTerminado = false;

    if (intervaloObjetos)  clearInterval(intervaloObjetos);
    if (intervaloPajaro)   clearInterval(intervaloPajaro);
    if (intervaloPatinete) clearInterval(intervaloPatinete);
    intervaloPajaro = null; intervaloPatinete = null;

    intervaloObjetos = setInterval(crearObjeto, 1000);
    actualizar();
}

// --- PUNTO DE ENTRADA desde HTML ---
// Llamado al pulsar ▶ JUGAR con el personaje elegido
function iniciarJuego(srcPersonaje) {
    // Elegir imagen del jugador
    imgJugador = (srcPersonaje === 'assets/personaje2.png') ? assets.jugador2 : assets.jugador;

    if (!juegoIniciado) {
        juegoIniciado = true;
        reiniciar();
    } else {
        reiniciar();
    }
}

// --- BUCLE PRINCIPAL ---
function actualizar() {
    if (juegoTerminado) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // FONDO: transición a fondo2 a partir de 1000 pts
    ctx.globalAlpha = 0.5;
    ctx.drawImage(assets.fondo, 0, 0, canvas.width, canvas.height);
    if (puntuacion >= 1000) {
        fondoAlpha = Math.min(1, fondoAlpha + 0.002);
        ctx.globalAlpha = fondoAlpha * 0.5;
        ctx.drawImage(assets.fondo2, 0, 0, canvas.width, canvas.height);
    }
    ctx.globalAlpha = 1.0;

    // JUGADOR — física
    if (jugador.movIzq && jugador.x > 0) jugador.x -= jugador.velocidad;
    if (jugador.movDer && jugador.x < canvas.width - jugador.ancho) jugador.x += jugador.velocidad;

    if (!jugador.enSuelo) {
        jugador.vy += GRAVEDAD;
        jugador.y  += jugador.vy;
        if (jugador.y >= SUELO_Y) {
            jugador.y = SUELO_Y;
            jugador.vy = 0;
            jugador.enSuelo = true;
        }
    }
    ctx.drawImage(imgJugador, jugador.x, jugador.y, jugador.ancho, jugador.alto);

    // Activar pájaro y patinete por hitos de puntuación
    if (!pajaroActivado && puntuacion >= 1000)   { pajaroActivado = true;   activarPajaro(); }
    if (!patineteActivado && puntuacion >= 2000)  { patineteActivado = true; activarPatinete(); }

    // --- OBJETOS (chicles y hojas) ---
    for (let i = 0; i < objetos.length; i++) {
        let o = objetos[i];
        o.y += o.vel;
        ctx.drawImage(o.tipo === 'hoja' ? assets.hoja : assets.chicle, o.x, o.y, o.ancho, o.alto);

        if (o.x < jugador.x + jugador.ancho && o.x + o.ancho > jugador.x &&
            o.y + o.alto > jugador.y && o.y < jugador.y + 20) {
            if (o.tipo === 'hoja') { puntuacion += 50; sonidoHoja(); }
            else                   { puntuacion += 10; sonidoChicle(); }
            objetos.splice(i, 1); i--;
        } else if (o.y > canvas.height) {
            if (o.tipo === 'chicle') { vidas--; sonidoCaida(); }
            if (vidas <= 0) { juegoTerminado = true; mostrarGameOver(); }
            objetos.splice(i, 1); i--;
        }
    }

    // --- PÁJAROS ---
    for (let i = 0; i < pajaros.length; i++) {
        let b = pajaros[i];
        b.x += b.vel;
        ctx.save();
        if (!b.haciaLaDerecha) {
            ctx.translate(b.x + b.ancho, b.y);
            ctx.scale(-1, 1);
            ctx.drawImage(assets.pajaro, 0, 0, b.ancho, b.alto);
        } else {
            ctx.drawImage(assets.pajaro, b.x, b.y, b.ancho, b.alto);
        }
        ctx.restore();

        b.framesCacaRestantes--;
        if (b.framesCacaRestantes <= 0) {
            cacas.push({ x: b.x + b.ancho/2 - 8, y: b.y + b.alto, ancho: 16, alto: 20, vel: 3 + Math.random()*2 });
            b.framesCacaRestantes = 50 + Math.floor(Math.random()*60);
        }
        if (b.x > canvas.width + 80 || b.x < -80) { pajaros.splice(i, 1); i--; }
    }

    // --- CACAS ---
    for (let i = 0; i < cacas.length; i++) {
        let c = cacas[i];
        c.y += c.vel;
        ctx.drawImage(assets.caca, c.x, c.y, c.ancho, c.alto);
        if (c.x < jugador.x + jugador.ancho && c.x + c.ancho > jugador.x &&
            c.y + c.alto > jugador.y && c.y < jugador.y + jugador.alto) {
            vidas--; sonidoCaca();
            if (vidas <= 0) { juegoTerminado = true; mostrarGameOver(); }
            cacas.splice(i, 1); i--;
        } else if (c.y > canvas.height) { cacas.splice(i, 1); i--; }
    }

    // --- PATINETES ---
    for (let i = 0; i < patinetes.length; i++) {
        let p = patinetes[i];
        p.x += p.vel;
        ctx.save();
        if (!p.haciaLaDerecha) {
            ctx.translate(p.x + p.ancho, p.y);
            ctx.scale(-1, 1);
            ctx.drawImage(assets.patinete, 0, 0, p.ancho, p.alto);
        } else {
            ctx.drawImage(assets.patinete, p.x, p.y, p.ancho, p.alto);
        }
        ctx.restore();

        // Colisión solo si el jugador está en el suelo (no ha saltado)
        const jugadorEnSuelo = jugador.y >= SUELO_Y - 2;
        if (jugadorEnSuelo &&
            p.x < jugador.x + jugador.ancho && p.x + p.ancho > jugador.x &&
            p.y < jugador.y + jugador.alto   && p.y + p.alto  > jugador.y) {
            vidas--;
            reproducirSonido(150, 'sawtooth', 0.2, 0.4, 80);
            if (vidas <= 0) { juegoTerminado = true; mostrarGameOver(); }
            patinetes.splice(i, 1); i--;
        } else if (p.x > canvas.width + 110 || p.x < -110) {
            patinetes.splice(i, 1); i--;
        }
    }

    // HUD
    ctx.textAlign = "left";
    ctx.fillStyle = "#333";
    ctx.font = "bold 18px Courier";
    ctx.fillText("Score: " + puntuacion, 10, 30);
    ctx.fillStyle = "#ff5c8d";
    ctx.fillText("Vidas: " + vidas, canvas.width - 100, 30);

    requestAnimationFrame(actualizar);
}

var canvas;
var gl;

var projMatrix;

// viewMatrixBase е матрицата на транслация [0, 0, -Z]
// Използваме я да сметнем viewMatrix, като viewMatrix
// е viewMatrixbase, но завъртяна въз основа на xrot и yrot
var viewMatrixBase, viewMatrix;

// ъгъла на камерата в радиани
var xrot = 0, yrot = 0;

// Понеже изразите, които потребителя може да въвежда стават доста големи
// му даваме да си дефинира макроси, които да преизползва.
// Макрото с име 'foo' може да бъде извикано от израз с '#foo'
var macros = [];

// Array със всичките particle системи
var systems = [];

// Ако в момента drag-ваме с десен бутон, dragging е true
// а prevX и prevY са x и y на курсора миналия кадър, ползваме ги
// да пресметнем с колко трябва да променим ъгъла на камерата
var dragging = false;
var prevX, prevY;


// 0.0 - начало на анимацията, 10.0 - 10 секунди в анимацията, ...
var time = 0;

// Максимална дължина на анимацията
var animation_duration = 5.0;

// времето отначало на страницата, ползваме го за да сметнем
// delta-time от миналия кадър до сегашния
var now = performance.now();

// Голям буфер със случайни стойности.
// TODO - ще е по-добре всяка система да има свой собствен seed
// вместо глобален буфер
var random1;


// помощна функция за създаване на HTML елементи
function mk(type, _class) {
    var el = document.createElement(type);
    if (_class)
        el.classList.add(_class);
    if (type == "input")
        el.size = 1;
    return el;
}

class ParticleSystem {
    constructor() {
        this.texture = "default.png";
        this.particleCount = 100;

        // Ако burst е true, всичките частици се появяват наведнъж.
        // В такъв случай се ползват start и duration.
        this.burst = true;
        this.start    = 0.0;
        this.duration = 2.0;

        // Ако burst е false, частиците се появяват една по една
        // и системата loop-ва. В такъв случай се ползва 'timeScale'
        this.timeScale = 1;

        // Ако cartesian е true, потребителят може да задава X, Y, Z
        // на отделните частици чрез математически формули
        this.cartesian = false;
        this.xEquation = "$t * $rand1";
        this.yEquation = "$t * $rand2";
        this.zEquation = "$t * $rand3";

        // Ако spherical е true, потребителят може да задава
        // сферичните координати на частиците чрез формули.
        // Възможно е cartesian и spherical едновременно да са true,
        // в който случай двата чифта координати се събират.
        this.spherical = true;
        this.pitchEquation = "$rand1";
        this.yawEquation = "$rand2";
        this.distEquation = "$t";

        this.rEquation = "1.0";
        this.gEquation = "1.0";
        this.bEquation = "1.0";
        this.alphaEquation = "1.0 - $t";
        
        this.sizeEquation = "0.05";

        // Понеже даваме на потребителя да въвежда формули,
        // които отиват директно в шейдъра, е възможно шейдърът да се счупи.
        // В такъв случай this.broken става true, и не рендрираме счупената
        // система.
        this.broken = false;

        this.init();
    }

    // Функцията превежда променливите, които даваме на потребителя
    // както и макросите, които той сам е дефинирал
    translate_equation(equation) {
        for (const macro of macros) {
            if (macro[0])
                equation = equation.replace("#" + macro[0], `(${macro[1]})`);
        }

        return "(" + equation.replaceAll("$t",     this.burst ? "aTime" : "adjustedTime")
                             .replaceAll("$i",     "aVertexPosition.z")
                             .replaceAll("$rand1", "aVertexPosition.w")
                             .replaceAll("$rand2", "aRandom1.x")
                             .replaceAll("$rand3", "aRandom1.y")
                             .replaceAll("$rand4", "aRandom1.z")
                             .replaceAll("$rand5", "aRandom1.w") + ")";
    }

    init() {
        this.create_buffer();
        this.create_shaders();
    }

    // на Vertex шейдъра подаваме като аргумент един огромен буфер,
    // в който са енкодирани всичките данни, 
    // които се променят от частица на частица
    create_buffer() {
        this.img = loadTexture(this.texture);

        // правим particleCount на брой квадратчета
        //
        // В positions буфера енкодидаме:
        // [0] -1 или 1, в зависимост дали върхът е ляв или десен в квадратчето
        // [1] -1 или 1, в зависимост дали върхът е горен или долен в квадратчето
        // [2] $i - стойност между 0 и 1, равномерно разпределени за всяка частица
        // [3..11] $rand3, $rand4, .. - случайни променливи
        var positions = new Array(48 * this.particleCount);
        for (let i = 0, r1 = 0; i < this.particleCount * 48; i += 48, r1 += 10) {

            var i_var = i / this.particleCount / 48;

            positions[i]      =  1; // X
            positions[i + 1]  =  1; // Y
            positions[i + 2]  =  i_var;

            positions[i + 12] = -1; // X
            positions[i + 13] =  1; // Y
            positions[i + 14] =  i_var;

            positions[i + 24] =  1; // X
            positions[i + 25] = -1; // Y
            positions[i + 26] =  i_var;

            positions[i + 36] = -1; // X
            positions[i + 37] = -1; // Y
            positions[i + 38] =  i_var;

            for (let j = 0; j < 9; j++) {
                positions[i + 3  + j] = random1[r1 + j];
                positions[i + 15 + j] = random1[r1 + j];
                positions[i + 27 + j] = random1[r1 + j];
                positions[i + 39 + j] = random1[r1 + j];
            }
        }
        
        var indices = new Array(6 * this.particleCount);
        for (let i = 0, j = 0; i < this.particleCount * 6; i += 6, j += 4) {
            indices[i]     = j;
            indices[i + 1] = j + 1;
            indices[i + 2] = j + 2;
            indices[i + 3] = j + 1;
            indices[i + 4] = j + 3;
            indices[i + 5] = j + 2;
        }

        if (this.buffer)
            gl.deleteBuffer(this.buffer);
        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        if (this.indices)
            gl.deleteBuffer(this.indices);
        this.indices = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    }

    create_shaders() {
        var vert = `
            #define PI  3.1415926538
            #define TAU 6.2831853076
            
            attribute vec4 aVertexPosition;
            attribute vec4 aRandom1;
            attribute vec4 aRandom2;

            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;

            uniform mediump float aTime;

            varying highp vec2 vTextureCoord;
            varying highp vec4 vRGBAmultiplier;

            void main(void) {
                float adjustedTime = aTime + aVertexPosition.z;
                if (adjustedTime > 1.0)
                    adjustedTime -= 1.0;

                vTextureCoord = vec2(aVertexPosition.x / 2.0 + 0.5, 0.5 - aVertexPosition.y / 2.0);

                vRGBAmultiplier = vec4(
                    ${this.translate_equation(this.rEquation)},
                    ${this.translate_equation(this.gEquation)},
                    ${this.translate_equation(this.bEquation)},
                    ${this.translate_equation(this.alphaEquation)}
                );

                vec4 center = vec4(0, 0, 0, 1);
        `;

        if (this.cartesian) {
            vert += `
                center.x += ${this.translate_equation(this.xEquation)};
                center.y += ${this.translate_equation(this.yEquation)};
                center.z += ${this.translate_equation(this.zEquation)};
            `;
        }
        if (this.spherical) {
            vert += `
                float pitch = ${this.translate_equation(this.pitchEquation)} * TAU;
                float yaw   = ${this.translate_equation(this.yawEquation)} * TAU;
                float dist  = ${this.translate_equation(this.distEquation)};

                center.x += dist * cos(pitch) * cos(yaw);
                center.z += dist * cos(pitch) * sin(yaw);
                center.y += dist * sin(pitch);
            `;
        }

        vert += `
                vec4 xy = vec4(aVertexPosition.xy, 0, 0);
                xy *= ${this.translate_equation(this.sizeEquation)};

                vec4 right = vec4(uModelViewMatrix[0][0], uModelViewMatrix[1][0], uModelViewMatrix[2][0], 0);
                vec4 up    = vec4(uModelViewMatrix[0][1], uModelViewMatrix[1][1], uModelViewMatrix[2][1], 0);

                vec4 translation = xy.y * up + xy.x * right;

                gl_Position = uProjectionMatrix * uModelViewMatrix * (translation + center);
            }`;

        const frag = `
            varying highp vec2 vTextureCoord;
            varying highp vec4 vRGBAmultiplier;

            uniform sampler2D uSampler;

            void main(void) {
                highp vec4 x = texture2D(uSampler, vTextureCoord);

                x.rgba *= vRGBAmultiplier;
                x.rgba *= vRGBAmultiplier.a * x.a;

                gl_FragColor = x;
            }`;

        this.program = makeShaderProgram(gl, vert, frag);
        if (!this.program) {
            this.broken = true;
            return;
        }

        this.programInfo = {
            vertexPosition: gl.getAttribLocation(this.program, 'aVertexPosition'),
            random1: gl.getAttribLocation(this.program, 'aRandom1'),
            random2: gl.getAttribLocation(this.program, 'aRandom2'),
            projectionMatrix: gl.getUniformLocation(this.program, 'uProjectionMatrix'),
            viewMatrix: gl.getUniformLocation(this.program, 'uModelViewMatrix'),
            sampler: gl.getUniformLocation(this.program, 'uSampler'),
            time: gl.getUniformLocation(this.program, 'aTime'),
        };
        this.broken = false;
    }
}

// точно така.
function isPowerOf2(x) {
    return x == 512 || x == 256;
}

loaded_textures = {};

function loadTexture(url) {
    if (url in loaded_textures) {
        return loaded_textures[url];
    }

    const texture = gl.createTexture();
    loaded_textures[url] = texture;

    gl.bindTexture(gl.TEXTURE_2D, texture);

    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([0, 0, 255, 255]);
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
        width, height, border, srcFormat, srcType,
        pixel);

    const image = new Image();
    image.onload = function() {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
            srcFormat, srcType, image);

        if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
            gl.generateMipmap(gl.TEXTURE_2D);
        } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        }
    };
    image.src = url;

    image.onerror = () => {
        alert(`Текстурата '${url}' не можа да се зареди`);
    }

    return texture;
} 


function beginDrag(e) {
    dragging = true;
    prevX = e.clientX;
    prevY = e.clientY;
}

function updateView() {
        mat4.copy(viewMatrix, viewMatrixBase);

        mat4.rotate(viewMatrix,
            viewMatrix,
            yrot,
            [1, 0, 0]);

        mat4.rotate(viewMatrix,
            viewMatrix,
            xrot,
            [0, 1, 0]);
}

function onMouseMove(e) {
    if (dragging) {
        xrot += 4 * (e.clientX - prevX) / canvas.width;
        yrot += 4 * (e.clientY - prevY) / canvas.height;

        if (yrot > 3.14159 / 2)
            yrot = 3.14159 / 2;
        if (yrot < -3.14159 / 2)
            yrot = -3.14159 / 2;

        prevX = e.clientX;
        prevY = e.clientY;

        updateView();
    }
}

function endDrag(e) {
    dragging = false;
}

function mkselector(parent, label_text, ps, str, type, fn) {
    var div = mk('div');

    var label = mk('span');
    label.innerText = label_text;

    var input = mk('input');

    switch (type) {
        case "boolean": {
            input.type = "checkbox";
            input.onchange = (e) => { 
                ps[str]  = input.checked;
                ps.init();
                if (fn)
                    fn(input.checked);
            }
            input.checked = ps[str];
            break;
        }
        case "float":  {
            input.onchange = (e) => { 
                ps[str]  = parseFloat(input.value);
                ps.init();
                if (fn)
                    fn(input.value);
            }
            input.value = ps[str];
            break;
        }
        default: {
            input.onchange = (e) => { 
                ps[str]  = input.value; 
                ps.init();
                if (fn)
                    fn(input.value);
            }
            input.value = ps[str];
            break;
        }
    }


    div.appendChild(label);
    div.appendChild(input);

    parent.appendChild(div);
    return div;
}

function mkseparator(li) {
    li.appendChild(mk('div', 'separator'));
}

function createSystem() {
    var ps = new ParticleSystem();
    systems.push(ps);

    updateSidebar();
    return ps;
}

function createMacro(m) {
    var div = mk('div', 'macro');

    var macro = m || ['foo', '1 + 2 + 3'];

    var name = mk('input');
    var val  = mk('input');
    name.value = macro[0];
    val.value  = macro[1];

    name.onchange = (_) => { macro[0] = name.value; }
    val.onchange  = (_) => { 
        macro[1] =  val.value; 
        for (const ps of systems)
            ps.init();
    }

    var delete_btn = mk('button', 'red_button');
    delete_btn.innerText = 'X';

    delete_btn.onclick = () => {
        var index = macros.indexOf(macro);
        if (index >= 0) {
            macros.splice(index, 1);
            document.getElementById('macros').removeChild(div);
        }
    };
    
    div.appendChild(name);
    div.appendChild(val);
    div.appendChild(delete_btn);

    macros.push(macro);
    document.getElementById('macros').appendChild(div);
}

function save() {
    var file = { 
        animation_duration: animation_duration,
        macros: macros,
        systems: []
    };

    for (var ps of systems) {
        var serialized = {
            texture:       ps.texture,
            particleCount: ps.particleCount,
            sizeEquation:  ps.sizeEquation,

            burst:         ps.burst,
            start:         ps.start,
            duration:      ps.duration,
            timeScale:     ps.timeScale,

            cartesian:     ps.cartesian,
            xEquation:     ps.xEquation,
            yEquation:     ps.yEquation,
            zEquation:     ps.zEquation,

            spherical:     ps.spherical,
            pitchEquation: ps.pitchEquation,
            yawEquation:   ps.yawEquation,
            distEquation:  ps.distEquation,

            
            rEquation:     ps.rEquation,
            gEquation:     ps.gEquation,
            bEquation:     ps.bEquation,
            alphaEquation: ps.alphaEquation,

        }
        file.systems.push(serialized);
    }

    var json = JSON.stringify(file);
    var blob = new Blob([json], { type: "application/json" });

    // Абстрактни JS глупости 
    // Създаваме виртуален URL с обекта, фалшив 'a' таг, добавяме го, кликаме го, и то запазва виртуалния файл
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = "particle_data.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

// Тази функция зарежда Particle системите от JSON string
function load(str) {
    time = 0;
    xrot = 0;
    yrot = 0;
    updateView();

    let json = JSON.parse(str);

    systems = [];
    macros = [];
    var macros_div = document.getElementById('macros');
    while (macros_div.firstChild)
        macros_div.removeChild(macros_div.firstChild);

    for (const macro of json.macros) {
        createMacro(macro);
    }

    animation_duration = json.animation_duration;
    document.getElementById('animLengthInput').value = animation_duration;

    for (let s of json.systems) {
        var ps = createSystem();

        ps.particleCount = s.particleCount;
        ps.texture       = s.texture;
        ps.sizeEquation  = s.sizeEquation;

        ps.burst         = s.burst;
        ps.start         = s.start;
        ps.duration      = s.duration;
        ps.timeScale     = s.timeScale;

        ps.spherical     = s.spherical;
        ps.pitchEquation = s.pitchEquation;
        ps.yawEquation   = s.yawEquation;
        ps.distEquation  = s.distEquation;

        ps.cartesian     = s.cartesian;
        ps.xEquation     = s.xEquation;
        ps.yEquation     = s.yEquation;
        ps.zEquation     = s.zEquation;

        ps.rEquation     = s.rEquation;
        ps.gEquation     = s.gEquation;
        ps.bEquation     = s.bEquation;
        ps.alphaEquation = s.alphaEquation;

        ps.init();
    }

    updateSidebar();
}


// Тази функция зарежда Particle системите от JSON файл
function load_from_file(e) {
    var files = document.getElementById('loadFiles').files;
    if (files.length == 0)
        return;
    
    var reader = new FileReader();
    reader.readAsText(files[0]);


    reader.addEventListener('load', (event) => {
        let data = event.target.result;
        load(data);
    });
}

function load_from_preset(preset_url) {
    var oReq = new XMLHttpRequest();

    oReq.onload = function(e) {
        var txt = oReq.responseText;
        if (txt)
            load(txt);
    }

    oReq.open("GET", preset_url);
    oReq.send();
}

// Изтрива елементите от стария sidebar, ако има такива
// и за всяка една система от systems създава ново entry
function updateSidebar() {
    const systems_ul = document.getElementById('systems');

    while (systems_ul.firstChild)
        systems_ul.removeChild(systems_ul.firstChild);

    for (const ps of systems) {
        var li = mk('li');

        mkselector(li, "Брой частици", ps, 'particleCount');
        mkselector(li, "Текстура",     ps, 'texture');
        mkselector(li, "Размер",       ps, 'sizeEquation');
        mkseparator(li);

        mkselector(li, "Взрив", ps, 'burst', 'boolean', update_burst);
        const start = mkselector(li, "Начало",          ps, 'start',    'float');
        const dur   = mkselector(li, "Продължителност", ps, 'duration', 'float');
        const ts    = mkselector(li, "Time Scale",      ps, 'timeScale');
        mkseparator(li);


        let cartesian = [];
        let spherical = [];

        function update_burst(b) {
            start.style.display = b ? "flex" : "none";
            dur.style.display   = b ? "flex" : "none";
            ts.style.display    = b ? "none" : "flex";
        }

        function update_visible_coordinates (cr)  {
            for (var c of cartesian) 
                c.style.display = cr ? "flex" : "none";
        };
        function update_visible_coordinates_spherical (cr)  {
            for (var s of spherical) 
                s.style.display = cr ? "flex" : "none";
        };

        mkselector(li, "Декартови координати", ps, 'cartesian', 'boolean', update_visible_coordinates);
        cartesian.push(mkselector(li, "X", ps, 'xEquation'));
        cartesian.push(mkselector(li, "Y", ps, 'yEquation'));
        cartesian.push(mkselector(li, "Z", ps, 'zEquation'));

        mkseparator(li);
        mkselector(li, "Сферични координати", ps, 'spherical', 'boolean', update_visible_coordinates_spherical);
        spherical.push(mkselector(li, "Pitch", ps, 'pitchEquation'));
        spherical.push(mkselector(li, "Yaw", ps, 'yawEquation'));
        spherical.push(mkselector(li, "Distance", ps, 'distEquation'));
        mkseparator(li);

        update_burst(ps.burst);
        update_visible_coordinates(ps.cartesian);
        update_visible_coordinates_spherical(ps.spherical);

        var delete_btn = mk('button', 'red_button');
        delete_btn.innerText = 'X';
        delete_btn.onclick = () => {
            var index = systems.indexOf(ps);
            if (index >= 0) {
                systems.splice(index, 1);
            }
            updateSidebar();
        }

        mkselector(li, "R", ps, 'rEquation');
        mkselector(li, "G", ps, 'gEquation');
        mkselector(li, "B", ps, 'bEquation');
        mkselector(li, "Прозрачност",  ps, 'alphaEquation');

        var bottom_div = mk('div');
        bottom_div.appendChild(delete_btn);

        li.appendChild(bottom_div);

        systems_ul.appendChild(li);
    }
}

function loadPresets() {
    var oReq = new XMLHttpRequest();

    oReq.onload = function(e) {
        var txt = oReq.responseText;

        for (const preset_url of txt.match(/[^\r\n]+/g)) {
            const btn = mk('button');
            btn.innerText = preset_url;
            document.getElementById('presets').appendChild(btn);
            btn.onclick = () => {
                load_from_preset(preset_url);
            }
        }
    }

    oReq.open("GET", "presets.txt");
    oReq.send();
}

function main() {
    loadPresets();

    canvas = document.getElementById('glcanvas');

    // Handler-и за дърпане с мишка
    canvas.onmousedown = beginDrag;
    canvas.onmouseup = endDrag;
    canvas.onmousemove = onMouseMove;

    // Ако потребителя качи файл със 'Зареди' бутона,
    // извикваме функцията за зареждане
    document.getElementById('loadFiles').onchange = load_from_file;

    // Инициализация на WebGL
    gl = canvas.getContext('webgl');
    if (!gl) {
        alert('Нямаме WebGL');
        return;
    }

    // TODO - това не трябва да е тук
    random1 = new Array(50000);
    for (var i = 0; i < 100000; i++) {
        random1[i] = (Math.random() - 0.5) * 2;
    }

    var animLengthInput = document.getElementById('animLengthInput');
    animLengthInput.value = animation_duration;
    animLengthInput.onchange = _ => {
        animation_duration = animLengthInput.value;
    }


    projMatrix = mat4.create();
    mat4.perspective(
        projMatrix, 
        45 * Math.PI / 180, gl.canvas.clientWidth / gl.canvas.clientHeight, 
        0.1, 
        100);

    viewMatrixBase = mat4.create();
    mat4.translate(viewMatrixBase, viewMatrixBase, [-0.0, 0.0, -5.0]);  
    viewMatrix = mat4.clone(viewMatrixBase);

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // gl.enable(gl.DEPTH_TEST);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    drawScene(0);
}


function drawScene() {
    let didDrawASystem = false;

    for (const ps of systems) {
        if (ps.broken)
            continue;

        if (ps.burst && (time < ps.start || time > ps.start + ps.duration))
            continue;

        didDrawASystem = true;

        gl.bindBuffer(gl.ARRAY_BUFFER, ps.buffer);
        
        gl.vertexAttribPointer(ps.programInfo.vertexPosition, 4, gl.FLOAT, false, 12 * 4, 0);
        gl.enableVertexAttribArray(ps.programInfo.vertexPosition);
        
        if (ps.programInfo.random1 >= 0) {
            gl.vertexAttribPointer(ps.programInfo.random1, 4, gl.FLOAT, false, 12 * 4, 4 * 4);
            gl.enableVertexAttribArray(ps.programInfo.random1);
        }
        
        gl.useProgram(ps.program);

        gl.activeTexture(gl.TEXTURE0);
        
        // Pass Texture
        gl.uniform1i(ps.sampler, 0);
        
        // Pass Indecies
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ps.indices);
        
        // Pass Matrices
        gl.uniformMatrix4fv(ps.programInfo.projectionMatrix, false, projMatrix);
        gl.uniformMatrix4fv(ps.programInfo.viewMatrix,  false, viewMatrix);
        
        // Pass Time
        var t;
        if (ps.burst) {
            t = time - ps.start;
            t /= ps.duration;
        }
        else {
            t = time * ps.timeScale;
            t -= Math.floor(t);
        }
        gl.uniform1f(ps.programInfo.time, t);
        
        gl.drawElements(gl.TRIANGLES, ps.particleCount * 6, gl.UNSIGNED_SHORT, 0);

        if (ps.programInfo.random1 >= 0)
            gl.disableVertexAttribArray(ps.programInfo.random1);
    }

    var new_now = performance.now();
    var dt = new_now - now;
    now = new_now;

    time += dt / 1000;
    if (time > animation_duration)
        time = 0;

    // Ако нямаме нарисувана система трябва да изчистим екрана
    if (!didDrawASystem) {
        gl.clearColor(0,0,0,1);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    document.getElementById('time').innerText = "Време: " + time.toFixed(2);

    requestAnimationFrame(() => { 
        drawScene(); 
    });
}

function makeShaderProgram(gl, vert, frag) {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vert);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, frag);

    if (!vertexShader || !fragmentShader)
        return null;

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert('ГРЕШКА!\n' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }
    return shaderProgram;
}

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert('ГРЕШКА!\n' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}


main();

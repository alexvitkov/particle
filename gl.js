var canvas, gl;
var randomBuffer;

var projMatrix;
var viewMatrixBase;
var viewMatrix;

var random1;
var texture;

// var macros = [];
var systems = [];

function id(i) {
    return document.getElementById(i);
}

function mk(type, _class) {
    var el = document.createElement(type);
    if (_class)
        el.classList.add(_class);
    if (type == "input")
        el.size = 1;
    return el;
}

class ParticleSystem {
    constructor(particleCount, duration) {
        this.burst = true;
        this.cartesian = false;
        this.spherical = true;
        this.particleCount = particleCount;
        this.xscale = 1;
        this.yscale = 1;
        this.timeScale = 1;
        this.duration = duration;

        this.xEquation = "$t * $rand1";
        this.yEquation = "$t * $rand2";
        this.zEquation = "$t * $rand3";

        this.pitchEquation = "$rand1";
        this.yawEquation = "$rand2";
        this.distEquation = "$t";

        this.alphaEquation = "1.0 - $t";

        this.sizeEquation = "0.05";

        this.init_shaders();
        this.init_buffer();
    }

    // Функцията превежда променливите, които даваме на потребителя - $t, $rand1, ...
    translate_equation(equation) {
        return equation.replaceAll("$t",     this.burst ? "aTime" : "adjustedTime")
                       .replaceAll("$i",     "aVertexPosition.z")
                       .replaceAll("$rand1", "aVertexPosition.w")
                       .replaceAll("$rand2", "aRandom1.x")
                       .replaceAll("$rand3", "aRandom1.y")
                       .replaceAll("$rand4", "aRandom1.z")
                       .replaceAll("$rand5", "aRandom1.w");
    }

    init_buffer() {
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

    init_shaders() {
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
            varying highp float alpha;

            void main(void) {
                float adjustedTime = aTime + aVertexPosition.z;
                if (adjustedTime > 1.0)
                    adjustedTime -= 1.0;

                vTextureCoord = vec2(aVertexPosition.x / 2.0 + 0.5, 0.5 - aVertexPosition.y / 2.0);

                alpha = ${this.translate_equation(this.alphaEquation)};

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
            uniform sampler2D uSampler;

            varying highp float alpha;

            void main(void) {
                highp vec4 x = texture2D(uSampler, vTextureCoord);
                x.rgba *= alpha * x.a;
                gl_FragColor = x;
            }`;

        this.program = makeShaderProgram(gl, vert, frag);
        if (!this.program)
            return;

        this.programInfo = {
            vertexPosition: gl.getAttribLocation(this.program, 'aVertexPosition'),
            random1: gl.getAttribLocation(this.program, 'aRandom1'),
            random2: gl.getAttribLocation(this.program, 'aRandom2'),
            projectionMatrix: gl.getUniformLocation(this.program, 'uProjectionMatrix'),
            viewMatrix: gl.getUniformLocation(this.program, 'uModelViewMatrix'),
            sampler: gl.getUniformLocation(this.program, 'uSampler'),
            time: gl.getUniformLocation(this.program, 'aTime'),
        };
    }
}

// точно така.
function isPowerOf2(x) {
    return x == 512 || x == 256;
}

function loadTexture(url) {
    const texture = gl.createTexture();
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
        alert(0)
    }

    return texture;
} 

var dragging = false;
var prevX, prevY;

var xrot = 0;
var yrot = 0;

function beginDrag(e) {
    dragging = true;
    prevX = e.clientX;
    prevY = e.clientY;
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
                ps.init_buffer();
                ps.init_shaders();
                if (fn)
                    fn(input.checked);
            }
            input.checked = ps[str];
            break;
        }
        default: {
            input.onchange = (e) => { 
                ps[str]  = input.value; 
                ps.init_buffer();
                ps.init_shaders();
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

function createSystem() {
    var ps = new ParticleSystem(100)
    systems.push(ps);

    updateSidebar();
    return ps;
}

function save() {
    var file = { 
        systems: []
    };

    for (var ps of systems) {
        var serialized = {
            cartesian:     ps.cartesian,
            spherical:     ps.spherical,
            burst:         ps.burst,
            particleCount: ps.particleCount,
            timeScale:     ps.timeScale,
            sizeEquation:  ps.sizeEquation,
            alphaEquation: ps.alphaEquation,
            xEquation:     ps.xEquation,
            yEquation:     ps.yEquation,
            zEquation:     ps.zEquation,
            pitchEquation: ps.pitchEquation,
            yawEquation:   ps.yawEquation,
            distEquation:  ps.distEquation,
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

function load(e) {
    var files = id('load').files;

    if (files.length == 0)
        return;
    
    var reader = new FileReader();
    reader.readAsText(files[0]);

    systems = [];

    reader.addEventListener('load', (event) => {
        let data = event.target.result;
        let json = JSON.parse(data);

        for (let s of json.systems) {
            var ps = createSystem();

            ps.cartesian     = s.cartesian;
            ps.spherical     = s.spherical;
            ps.burst         = s.burst;
            ps.particleCount = s.particleCount;
            ps.timeScale     = s.timeScale;
            ps.sizeEquation  = s.sizeEquation;
            ps.alphaEquation = s.alphaEquation;
            ps.xEquation     = s.xEquation;
            ps.yEquation     = s.yEquation;
            ps.zEquation     = s.zEquation;
            ps.pitchEquation = s.pitchEquation;
            ps.yawEquation   = s.yawEquation;
            ps.distEquation  = s.distEquation;

            ps.init_buffer();
            ps.init_shaders();
        }

        updateSidebar();
    });
}

function updateSidebar() {
    const systems_ul = id('systems');

    while (systems_ul.firstChild)
        systems_ul.removeChild(systems_ul.firstChild);

    for (const ps of systems) {
        var li = mk('li');

        mkselector(li, "Взрив", ps, 'burst', 'boolean');
        mkselector(li, "Брой частици", ps, 'particleCount');
        mkselector(li, "Time Scale", ps, 'timeScale');
        mkselector(li, "Размер", ps, 'sizeEquation');
        mkselector(li, "Прозрачност", ps, 'alphaEquation');

        let cartesian = [];
        let spherical = [];

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

        mkselector(li, "Сферични координати", ps, 'spherical', 'boolean', update_visible_coordinates_spherical);
        spherical.push(mkselector(li, "Pitch", ps, 'pitchEquation'));
        spherical.push(mkselector(li, "Yaw", ps, 'yawEquation'));
        spherical.push(mkselector(li, "Distance", ps, 'distEquation'));

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

        var bottom_div = mk('div');
        bottom_div.appendChild(delete_btn);

        li.appendChild(bottom_div);

        systems_ul.appendChild(li);
    }
}


function main() {
    canvas = id('glcanvas');

    canvas.onmousedown = beginDrag;
    canvas.onmouseup = endDrag;
    canvas.onmousemove = onMouseMove;

    id('load').onchange = load;

    gl = canvas.getContext('webgl');
    if (!gl) {
        alert('Нямаме WebGL');
        return;
    }

    random1 = new Array(50000);
    for (var i = 0; i < 100000; i++) {
        random1[i] = (Math.random() - 0.5) * 2;
    }

    projMatrix = mat4.create();
    mat4.perspective(projMatrix, 45 * Math.PI / 180, gl.canvas.clientWidth / gl.canvas.clientHeight, 0.1, 100);

    viewMatrixBase = mat4.create();
    mat4.translate(viewMatrixBase, viewMatrixBase, [-0.0, 0.0, -5.0]);  
    viewMatrix = mat4.clone(viewMatrixBase);

    // Load the texture
    texture = loadTexture("default-particle.png");
    
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE0, texture);

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // gl.enable(gl.DEPTH_TEST);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    drawScene(0);
}

var time = 0;
var now = performance.now();


function drawScene() {
    for (const ps of systems) {
        gl.bindBuffer(gl.ARRAY_BUFFER, ps.buffer);
        
        gl.vertexAttribPointer(ps.programInfo.vertexPosition, 4, gl.FLOAT, false, 12 * 4, 0);
        gl.enableVertexAttribArray(ps.programInfo.vertexPosition);
        
        if (ps.programInfo.random1 >= 0) {
            gl.vertexAttribPointer(ps.programInfo.random1, 4, gl.FLOAT, false, 12 * 4, 4 * 4);
            gl.enableVertexAttribArray(ps.programInfo.random1);
        }
        
        gl.useProgram(ps.program);
        
        // Pass Texture
        gl.uniform1i(ps.sampler, 0);
        
        // Pass Indecies
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ps.indices);
        
        // Pass Matrices
        gl.uniformMatrix4fv(ps.programInfo.projectionMatrix, false, projMatrix);
        gl.uniformMatrix4fv(ps.programInfo.viewMatrix,  false, viewMatrix);
        
        // Pass Time
        var t = time * ps.timeScale;
        t -= Math.floor(t);
        gl.uniform1f(ps.programInfo.time, t);
        
        gl.drawElements(gl.TRIANGLES, ps.particleCount * 6, gl.UNSIGNED_SHORT, 0);

        if (ps.programInfo.random1 >= 0)
            gl.disableVertexAttribArray(ps.programInfo.random1);
    }


    var new_now = performance.now();
    var dt = new_now - now;
    now = new_now;

    if (systems.length > 0) {
        time += dt / 1000;
    }
    else {
        time = 0;
        gl.clearColor(0,0,0,1);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    id('time').innerText = "Време: " + time.toFixed(2);

    requestAnimationFrame(() => { 
        drawScene(); 
    });
}

function makeShaderProgram(gl, vert, frag) {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vert);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, frag);

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

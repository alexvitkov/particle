var canvas, gl;
var randomBuffer;

var projMatrix;
var viewMatrix;

var random1;

class ParticleSystem {

    constructor(maxParticleCount, duration) {
        this.maxParticleCount = maxParticleCount;
        this.xscale = 1;
        this.yscale = 1;
        this.duration = duration;

        this.init_shaders();
        this.init_buffer();
    }

    init_buffer() {
        // правим maxParticleCount на брой квадратчета
        var positions = new Array(48 * this.maxParticleCount);
        for (let i = 0, r1 = 0; i < this.maxParticleCount * 48; i += 48, r1 += 10) {
            positions[i] = 1;
            positions[i + 1]  = 1;
            positions[i + 12] = -1;
            positions[i + 13] = 1;
            positions[i + 24] = 1;
            positions[i + 25] = -1;
            positions[i + 36] = -1;
            positions[i + 37] = -1;

            for (let j = 0; j < 10; j++) {
                positions[i + 2  + j] = random1[r1 + j];
                positions[i + 14 + j] = random1[r1 + j];
                positions[i + 26 + j] = random1[r1 + j];
                positions[i + 38 + j] = random1[r1 + j];
            }
        }
        
        var indices = new Array(6 * this.maxParticleCount);
        for (let i = 0, j = 0; i < this.maxParticleCount * 6; i += 6, j += 4) {
            indices[i] = j;
            indices[i + 1] = j + 1;
            indices[i + 2] = j + 2;
            indices[i + 3] = j + 1;
            indices[i + 4] = j + 2;
            indices[i + 5] = j + 3;
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
            attribute vec4 aVertexPosition;
            attribute vec4 aRandom1;
            attribute vec4 aRandom2;

            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;

            uniform mediump float aTime;

            varying mediump vec4 vColor;

            void main(void) {
                float angle = 30.0 * 3.14158 / 180.0;
                float scalex = 0.1;
                float scaley = 0.1;

                float sinangle = sin(angle);
                float cosangle = cos(angle);

                vec4 vp = aVertexPosition;
                vec4 vp2 = vec4(0,0,0,1);
                vp.x *= scalex;
                vp.y *= scaley;
                vp2.x = vp.x * cosangle - vp.y * sinangle;
                vp2.y = vp.x * sinangle + vp.y * cosangle;

                vp2.x += aTime * aVertexPosition.z * 1.0;
                vp2.y += aTime * aVertexPosition.w * 1.0;
                vp2.z += aTime * aRandom1.y * 1.0;

                gl_Position = uProjectionMatrix * uModelViewMatrix * vp2;
                vColor = vec4(1,0,0,1);
            }`;

        const frag = `
            varying lowp vec4 vColor;

            void main(void) {
                gl_FragColor = vColor;
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
            time: gl.getUniformLocation(this.program, 'aTime'),
        };

    }
}

function main() {
    canvas = document.querySelector('#glcanvas');
    gl = canvas.getContext('webgl');
    if (!gl) {
        alert('Нямаме WebGL');
        return;
    }

    random1 = new Array(5000);
    for (var i = 0; i < 10000; i++) {
        random1[i] = (Math.random() - 0.5) * 2;
    }

    projMatrix = mat4.create();
    mat4.perspective(projMatrix, 45 * Math.PI / 180, gl.canvas.clientWidth / gl.canvas.clientHeight, 0.1, 100);
    
    viewMatrix = mat4.create();
    mat4.translate(viewMatrix, viewMatrix, [-0.0, 0.0, -5.0]);  

    ps = new ParticleSystem(100);

    drawScene(ps, 0);
}

function drawScene(ps, time) {
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);                 
    gl.enable(gl.DEPTH_TEST);           
    gl.depthFunc(gl.LEQUAL);            
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);


    gl.bindBuffer(gl.ARRAY_BUFFER, ps.buffer);

    gl.vertexAttribPointer(ps.programInfo.vertexPosition, 4, gl.FLOAT, false, 12 * 4, 0);
    gl.enableVertexAttribArray(ps.programInfo.vertexPosition);

    if (ps.programInfo.random1 >= 0) {
        gl.vertexAttribPointer(ps.programInfo.random1, 4, gl.FLOAT, false, 12 * 4, 4 * 4);
        gl.enableVertexAttribArray(ps.programInfo.random1);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ps.indices);
    gl.useProgram(ps.program);

    gl.uniformMatrix4fv(ps.programInfo.projectionMatrix, false, projMatrix);
    gl.uniformMatrix4fv(ps.programInfo.viewMatrix,  false, viewMatrix);
    gl.uniform1f(ps.programInfo.time, time);

    gl.drawElements(gl.TRIANGLES, ps.maxParticleCount * 6, gl.UNSIGNED_SHORT, 0);
    //gl.drawElements(gl.TRIANGLES, 4 * 6, gl.UNSIGNED_SHORT, 0);

    /*
    mat4.rotate(viewMatrix,
        viewMatrix,
        0.01,
        [0, 1, 0]);
        */

    requestAnimationFrame(() => { drawScene(ps, time + 0.01); });
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

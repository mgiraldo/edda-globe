/**
 * dat.globe Javascript WebGL Globe Toolkit
 * http://dataarts.github.com/dat.globe
 *
 * Copyright 2011 Data Arts Team, Google Creative Lab
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

var DAT = DAT || {};

DAT.Globe = function(container, opts) {
  opts = opts || {};
  
  var colorFn = opts.colorFn || function(x) {
    var c = new THREE.Color();
    c.setHSL( ( 0.6 - ( x * 0.5 ) ), 1.0, 0.5 );
    return c;
  };
  var imgDir = opts.imgDir || 'globe/';

  var worldSize = 220;

  var callerPositions = [];

  var Shaders = {
    'atmosphere' : {
      uniforms: {},
      vertexShader: [
        'varying vec3 vNormal;',
        'void main() {',
          'vNormal = normalize( normalMatrix * normal );',
          'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vNormal;',
        'void main() {',
          'float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 12.0 );',
          'gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 ) * intensity;',
        '}'
      ].join('\n')
    }
  }

  var camera, scene, renderer, w, h;
  var mesh, atmosphere, point;

  var overRenderer;

  var curZoomSpeed = 0;
  var zoomSpeed = 50;

  var mouse = { x: 0, y: 0 }, mouseOnDown = { x: 0, y: 0 };
  var rotation = { x: Math.PI/2, y: Math.PI/2 },
      target = { x: Math.PI*3/2, y: Math.PI/6 },
      targetOnDown = { x: 0, y: 0 };

  var distance = 1000, distanceTarget = 100000;
  var padding = 40;
  var PI_HALF = Math.PI * .5;

  function init() {
    container.style.color = '#000';
    container.style.backgroundColor = '#000';
    container.style.font = '13px/20px Arial, sans-serif';

    w = container.offsetWidth || window.innerWidth;
    h = container.offsetHeight || window.innerHeight;

    camera = new THREE.PerspectiveCamera(30, w / h, 1, 10000);
    camera.position.z = distance;

    scene = new THREE.Scene();

    var geometry = new THREE.SphereGeometry(worldSize, 80, 60);

    var texture = THREE.ImageUtils.loadTexture(imgDir+'world-line-thin.small.png');

    var shader = Shaders['atmosphere'];
    var uniforms = THREE.UniformsUtils.clone(shader.uniforms);

    var shaderMaterial = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true
    });

    mesh = new THREE.Mesh(geometry, shaderMaterial);
    mesh.scale.set( 1.1, 1.1, 1.1 );
    scene.add(mesh);

    var brightMaterial = new THREE.MeshLambertMaterial({
        color: 0x00ffff,
        side: THREE.FrontSide,
        opacity: 1,
        transparent: true,
        depthTest: false,
        alphaMap: texture,
        map: texture
    });

    var darkMaterial = new THREE.MeshLambertMaterial({
        color: 0x004444,
        side: THREE.BackSide,
        opacity: 1,
        transparent: false,
        depthTest: true,
        alphaMap: texture,
        map: texture
    });

    mesh = new THREE.Mesh(geometry, darkMaterial);
    mesh.rotation.y = Math.PI;

    scene.add(mesh);

    mesh = new THREE.Mesh(geometry, brightMaterial);
    mesh.rotation.y = Math.PI;

    scene.add(mesh);

    var ambientLight = new THREE.AmbientLight(0x00ffff);
    scene.add(ambientLight);

    geometry = new THREE.SphereGeometry(4, 40, 40);
    
    var basicMaterial = new THREE.MeshBasicMaterial({});

    point = new THREE.Mesh(geometry, basicMaterial);

    renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});

    renderer.setSize(w, h);

    renderer.domElement.style.position = 'absolute';

    container.appendChild(renderer.domElement);

    container.addEventListener('mousedown', onMouseDown, false);
    container.addEventListener('touchstart', onMouseDown, false);

    container.addEventListener('mousewheel', onMouseWheel, false);

    document.addEventListener('keydown', onDocumentKeyDown, false);

    window.addEventListener('resize', onWindowResize, false);

    container.addEventListener('mouseover', function() {
      overRenderer = true;
    }, false);

    container.addEventListener('mouseout', function() {
      overRenderer = false;
    }, false);
  }

  function addData(data, opts) {
    var lat, lng, size, color, i, step, colorFnWrapper;

    var p;

    opts.animated = opts.animated || false;
    this.is_animated = opts.animated;
    opts.format = opts.format || 'magnitude'; // other option is 'legend'
    if (opts.format === 'magnitude') {
      step = 3;
      colorFnWrapper = function(data, i) { return colorFn(data[i+2]); }
    } else if (opts.format === 'legend') {
      step = 4;
      colorFnWrapper = function(data, i) { return colorFn(data[i+3]); }
    } else {
      throw('error: format not supported: '+opts.format);
    }

    if (opts.animated) {
      if (this._baseGeometry === undefined) {
        this._baseGeometry = new THREE.Geometry();
        for (i = 0; i < data.length; i += step) {
          lat = data[i];
          lng = data[i + 1];
          color = new THREE.Color( 0x00ffff );//colorFnWrapper(data,i);
          size = 0;
          p = addPoint(lat, lng, size, color, this._baseGeometry);
          callerPositions.push(p);
        }
      }
      if(this._morphTargetId === undefined) {
        this._morphTargetId = 0;
      } else {
        this._morphTargetId += 1;
      }
      opts.name = opts.name || 'morphTarget'+this._morphTargetId;
    }

    var subgeo = new THREE.Geometry();

    for (i = 0; i < data.length; i += step) {
      lat = data[i];
      lng = data[i + 1];
      color = new THREE.Color( [0xffff00, 0xff00ff][i%2] );//colorFnWrapper(data,i);
      size = data[i + 2];
      size = size*worldSize;
      p = addPoint(lat, lng, size, color, subgeo);
      callerPositions.push(p);
    }
    if (opts.animated) {
      this._baseGeometry.morphTargets.push({'name': opts.name, vertices: subgeo.vertices});
    } else {
      this._baseGeometry = subgeo;
    }
  };

  function createPoints() {
    if (this._baseGeometry !== undefined) {
      if (this.is_animated === false) {
        this.points = new THREE.Mesh(this._baseGeometry, new THREE.MeshBasicMaterial({
              color: 0xffffff,
              vertexColors: THREE.FaceColors,
              morphTargets: false
            }));
      } else {
        if (this._baseGeometry.morphTargets.length < 8) {
          console.log('t l',this._baseGeometry.morphTargets.length);
          var padding = 8-this._baseGeometry.morphTargets.length;
          console.log('padding', padding);
          for(var i=0; i<=padding; i++) {
            console.log('padding',i);
            this._baseGeometry.morphTargets.push({'name': 'morphPadding'+i, vertices: this._baseGeometry.vertices});
          }
        }
        this.points = new THREE.Mesh(this._baseGeometry, new THREE.MeshBasicMaterial({
              color: 0xffffff,
              vertexColors: THREE.FaceColors,
              morphTargets: true
            }));
      }
      scene.add(this.points);
    }
    addLine();
  }

  function addPoint(lat, lng, size, color, subgeo) {

    var phi = (90 - lat) * Math.PI / 180;
    var theta = (180 - lng) * Math.PI / 180;

    var x = worldSize * Math.sin(phi) * Math.cos(theta);
    var y = worldSize * Math.cos(phi);
    var z = worldSize * Math.sin(phi) * Math.sin(theta);

    point.position.x = x;
    point.position.y = y;
    point.position.z = z;

    point.lookAt(mesh.position);

    point.radius = Math.max( size, 0.1 ); // avoid non-invertible matrix
    point.updateMatrix();

    for (var i = 0; i < point.geometry.faces.length; i++) {

      point.geometry.faces[i].color = color;

    }
    if(point.matrixAutoUpdate){
      point.updateMatrix();
    }
    subgeo.merge(point.geometry, point.matrix);
    var p = {x:x, y:y, z:z};
    console.log(p);
    return p;
  }

  function addLine() {
    var material = new THREE.LineBasicMaterial({
        color: 0x0000ff,
        linewidth: 8
    });

    var geometry = new THREE.Geometry();
    geometry.vertices.push(
        new THREE.Vector3( callerPositions[0].x, callerPositions[0].y, callerPositions[0].z ),
        new THREE.Vector3( callerPositions[1].x, callerPositions[1].y, callerPositions[1].z )
    );

    var line = new THREE.Line( geometry, material );
    scene.add( line );
  }

  function onMouseDown(event) {
    event.preventDefault();

    container.addEventListener('mousemove', onMouseMove, false);
    container.addEventListener('mouseup', onMouseUp, false);
    container.addEventListener('mouseout', onMouseOut, false);

    container.addEventListener('touchmove', onMouseMove, false);
    container.addEventListener('touchend', onMouseUp, false);
    
    if (event.type!="touchstart") {
        mouseOnDown.x = - event.clientX;
        mouseOnDown.y = event.clientY;
    } else {
        mouseOnDown.x = - event.touches[0].clientX;
        mouseOnDown.y = event.touches[0].clientY;
    }

    targetOnDown.x = target.x;
    targetOnDown.y = target.y;

    container.style.cursor = 'move';
  }

  function onMouseMove(event) {
    if (event.type!="touchmove") {
        mouse.x = - event.clientX;
        mouse.y = event.clientY;
    } else {
        mouse.x = - event.touches[0].clientX;
        mouse.y = event.touches[0].clientY;
    }

    var zoomDamp = distance/1000;

    target.x = targetOnDown.x + (mouse.x - mouseOnDown.x) * 0.005 * zoomDamp;
    target.y = targetOnDown.y + (mouse.y - mouseOnDown.y) * 0.005 * zoomDamp;

    target.y = target.y > PI_HALF ? PI_HALF : target.y;
    target.y = target.y < - PI_HALF ? - PI_HALF : target.y;
  }

  function onMouseUp(event) {
    container.removeEventListener('mousemove', onMouseMove, false);
    container.removeEventListener('mouseup', onMouseUp, false);
    container.removeEventListener('mouseout', onMouseOut, false);

    container.addEventListener('touchmove', onMouseMove, false);
    container.addEventListener('touchend', onMouseUp, false);

    container.style.cursor = 'auto';
  }

  function onMouseOut(event) {
    container.removeEventListener('mousemove', onMouseMove, false);
    container.removeEventListener('mouseup', onMouseUp, false);
    container.removeEventListener('mouseout', onMouseOut, false);
  }

  function onMouseWheel(event) {
    event.preventDefault();
    if (overRenderer) {
      zoom(event.wheelDeltaY * 0.3);
    }
    return false;
  }

  function onDocumentKeyDown(event) {
    switch (event.keyCode) {
      case 38:
        zoom(100);
        event.preventDefault();
        break;
      case 40:
        zoom(-100);
        event.preventDefault();
        break;
    }
  }

  function onWindowResize( event ) {
    camera.aspect = container.offsetWidth / container.offsetHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( container.offsetWidth, container.offsetHeight );
  }

  function zoom(delta) {
    distanceTarget -= delta;
    distanceTarget = distanceTarget > 1000 ? 1000 : distanceTarget;
    distanceTarget = distanceTarget < 350 ? 350 : distanceTarget;
  }

  function animate() {
    requestAnimationFrame(animate);
    render();
  }

  function render() {
    zoom(curZoomSpeed);

    rotation.x += (target.x - rotation.x) * 0.1;
    rotation.y += (target.y - rotation.y) * 0.1;
    distance += (distanceTarget - distance) * 0.3;

    camera.position.x = distance * Math.sin(rotation.x) * Math.cos(rotation.y);
    camera.position.y = distance * Math.sin(rotation.y);
    camera.position.z = distance * Math.cos(rotation.x) * Math.cos(rotation.y);

    camera.lookAt(mesh.position);

    renderer.render(scene, camera);
  }

  init();
  this.animate = animate;


  this.__defineGetter__('time', function() {
    return this._time || 0;
  });

  this.__defineSetter__('time', function(t) {
    var validMorphs = [];
    var morphDict = this.points.morphTargetDictionary;
    for(var k in morphDict) {
      if(k.indexOf('morphPadding') < 0) {
        validMorphs.push(morphDict[k]);
      }
    }
    validMorphs.sort();
    var l = validMorphs.length-1;
    var scaledt = t*l+1;
    var index = Math.floor(scaledt);
    for (i=0;i<validMorphs.length;i++) {
      this.points.morphTargetInfluences[validMorphs[i]] = 0;
    }
    var lastIndex = index - 1;
    var leftover = scaledt - index;
    if (lastIndex >= 0) {
      this.points.morphTargetInfluences[lastIndex] = 1 - leftover;
    }
    this.points.morphTargetInfluences[index] = leftover;
    this._time = t;
  });

  this.addData = addData;
  this.createPoints = createPoints;
  this.renderer = renderer;
  this.scene = scene;
  this.camera = camera;
  this.target = target;
  this.callerPositions = callerPositions;

  return this;

};


$(function() {
	
	function animate() {
	requestAnimationFrame( animate );

	cube.rotation.x += 0.1;
	cube.rotation.y += 0.1;

	renderer.render(scene, camera);
	}
	
	function onContainerResize() {
		// wait for bootstrap
		setTimeout(function() {
			renderer.setSize($(container).width(), $(container).height());
			camera.updateProjectionMatrix();
			camera.aspect = $(container).width() / $(container).height();
			renderer.render(scene, camera);
		}, 1);
	}
	
    var scene = new THREE.Scene();
	var container = document.getElementById("x_graph");
	var camera = new THREE.PerspectiveCamera( 75, $(container).width() / $(container).height(), 0.1, 1000 );

	var renderer = new THREE.WebGLRenderer();
	renderer.setSize( $(container).width(), $(container).height() );
	$('#x_graph').append( renderer.domElement );
	
	window.addEventListener( 'resize', onContainerResize, false );
	$("#menu_toggle").mouseup(onContainerResize);

	var geometry = new THREE.BoxGeometry( 1, 1, 1 );
	var material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
	var cube = new THREE.Mesh( geometry, material );
	scene.add( cube );

	camera.position.z = 5;
	
	animate();
})
var globe = DAT.Globe(document.getElementById('container'));

var data = [
    ['seriesA', [ 4.598056, -74.075833, 1, -6.208763, 106.845599, 1 ]]
];

window.data = data;

for (var i=0;i<data.length;i++) {
    globe.addData(data[i][1], {format: 'magnitude'});
}

globe.createPoints();
globe.animate();

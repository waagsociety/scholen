var markerSize = 30;
var greenIcon = L.icon({
    iconUrl: '../images/marker.svg',
    iconSize: [markerSize, markerSize],
    iconAnchor: [markerSize / 2, markerSize],
    popupAnchor: [markerSize / 2, markerSize / 2]
});

L.LocationLayer = L.Marker.extend({
  initialize: function (latlng) {
    options = L.setOptions(this, {
      draggable: true,
      icon: greenIcon
    });
    this._latlng = L.latLng(latlng);
  }
});

L.locationLayer = function (latlng, callback) {
  return new L.LocationLayer(latlng)
    .on('dragend', function(e) {
      callback(e.target._latlng);
    });
};

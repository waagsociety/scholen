L.LocationLayer = L.Marker.extend({
  initialize: function (latlng) {
    options = L.setOptions(this, {draggable: true});
    this._latlng = L.latLng(latlng);
  }
});

L.locationLayer = function (latlng, callback) {
  return new L.LocationLayer(latlng)
    .on('dragend', function(e) {
      callback(e.target._latlng);
    });
};

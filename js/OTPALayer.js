/*
 * Class calls OTP indicators API
 *
 * TODO: make another, abstract class, to make choosing between
 * client-side/server-side classification/binning and rendering abstract/transparent
 * TODO: stop using `var self = this`, find official Leaflet way to do this. Use bind.
 */

L.OTPALayer = L.FeatureGroup.extend({

  options: {

  },

  initialize: function (endpoint, options) {
    // TODO: fix options, setOptions, and check if options are set
    this._endpoint = endpoint;
    if (this._endpoint.slice(-1) !== '/') {
      this._endpoint += '/';
    }
    this._cutoffMinutes = options.cutoffMinutes || 90;
    this._isochroneMinutes = options.isochroneMinutes || 10;
    this._bannedRoutes = options.bannedRoutes || [];
    this._modes = options.modes || ['WALK', 'TRANSIT'];
    this._routerId = options.routerId;
    this._pointset = options.pointset;
    this._colors = options.colors;
    this._isochroneStep = options.isochroneStep || 2;

    if (options.filterPointsets) {
      this._filterPointsets = options.filterPointsets;
    } else {
      this._filterPointsets = false;
    }

    if (options.location) {
      this._location = L.latLng(options.location);
    }

    this._layers = [];

    options = L.setOptions(this, options);
  },

  addTo: function (map) {
    var self = this;
    if (!self._location) {
      self._location = map.getCenter();
    }

    // First, get available pointsets
    self._getPointsets(function(pointsets) {
      self._pointsets = pointsets;
      self.fireEvent('pointsets', {data: pointsets});
    });

    //if (this._pointset)

    // When layer is added to map, also add LocationLayer
    // TODO: remove locationlayer when this layer is removed!
    this._locationLayer = L.locationLayer(self._location, function(latlng) {
      self.setLocation(latlng);
    }).addTo(map);

    this._isochronesLayer = L.geoJson([], {
      style: function(feature) {
        var style = {
          color: self._colors[0],
          fillColor: 'url(#isochrone-pattern)',
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
          weight: 4,
          //dashArray: '5, 5',
          fillOpacity: '0.3',
          clickable: false
        };
        if (feature.properties.Time == this._cutoffMinutes * 60) {
          style.weight = 1;
        }
        return style;
      }
    }).addTo(map);

    this._pointsetLayer = L.geoJson([], {
      pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, self._pointsetStyle(feature.properties));
      }
    });
    this._reducedPointsetLayer = L.geoJson([], {
      pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, self._pointsetStyle(feature.properties));
      }
    }).addTo(map);
    if (this._filterPointsets) {
      this._reducedPointsetLayer.addTo(map);
    } else {
      this._pointsetLayer.addTo(map);
    }

    self._createSurface(self._location);

    return self;
  },

  setLocation: function (latlng) {
    var self = this;
    self._location = latlng;
    self._createSurface(self._location);
  },

  setPointset: function (pointset) {
    var self = this;
    self._pointset = pointset;
    // TODO: check if pointset is in self._pointsets
    self._getIndicator(self._surface.id, self._pointset);
  },

  setTimeLimit: function (timeLimit) {
    var self = this;
    if (self._indicator && self._isochrones) {
      self._isochronesMinutes = timeLimit;
      self._displayIsochrone(timeLimit);
    }
  },

  setModes: function(modes) {
    this._modes = modes;
    this._createSurface(this._location);
  },

  _pointsetStyle: function(properties) {
    return {
      radius: 6,
      fillColor: this._colors[1],
      color: this._colors[1],
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    };
  },

  _createSurface: function(location) {
    var self = this;
    var path = 'surfaces?'
        + 'fromPlace=' + location.lat + ',' + location.lng
        + '&cutoffMinutes=' + this._cutoffMinutes
        + (this._routerId ? '&routerId=' + this._routerId : '')
        + (this._bannedRoutes ? '&bannedRoutes=' + this._bannedRoutes.join(',') : '')
        + '&mode=' + this._modes.join(',')
        + '&batch=true';
    this._postJSON(path, function(json) {
      if (json && json.id) {
        self._surface = json;
        if (self._pointset) {
          self._getIndicator(self._surface.id, self._pointset);
          self._getPointset(self._pointset);
        }
        self._getIsochrones();
      }
    });
  },

  _getIndicator: function(surfaceId, pointset) {
    var self = this;
    var path = 'surfaces/' + surfaceId
        + '/indicator'
        + '?targets=' + pointset
        + '&detail=true';

    this._getJSON(path, function(indicator) {
      self._indicator = indicator;
      self.fireEvent('change', {data: indicator});
    });
  },

  // TODO changing me to fetch specific isochrones based on slider
  _getIsochrones: function() {
    var self = this;
    // TODO: get spacing from options
    var path = 'surfaces/' + self._surface.id + '/isochrone?spacing=' + this._isochroneStep;
    this._getJSON(path, function(isochrones) {
      // Index isochrones, keying on time in minutes
      self._isochrones = {};
      isochrones.features.forEach(function(feature) {
        self._isochrones[parseInt(feature.properties.time) / 60] = feature;
      });
      self._displayIsochrone();
    });
  },

  _displayIsochrone: function(minutes) {
    // if no new value is supplied, redraw the last used value
    minutes = minutes || this._isochroneMinutes;

    // Find the closest isochrone
    var minDiff = Number.POSITIVE_INFINITY;
    var minDiffMinutes = 0;
    for (var m in this._isochrones) {
      var diff = Math.abs(m - minutes);
      if (diff <= minDiff) {
        minDiff = diff;
        minDiffMinutes = m;
      }
    }
    minutes = minDiffMinutes;

    this._isochronesLayer.clearLayers();

    this._isochronesLayer.addData(this._isochrones[minutes]);
    this._isochroneMinutes = minutes;

    this._reducePointsets();
  },

  _reducePointsets: function() {
    console.log('reduce!')
    // // Get isochronesLayer GeoJSON
    // isoGeo = this._isochronesLayer.toGeoJSON();
    // // Get pointsetsLayer GeoJson
    // pointsetsGeo = this._pointsetLayer.toGeoJSON();
    // // Check wich points are within the isochrones and display
    // insidePoints = turf.within(pointsetsGeo, isoGeo);
    // this._reducedPointsetLayer.clearLayers();
    // this._reducedPointsetLayer.addData(insidePoints);
  },

  _getPointsets: function(callback) {
    var path = 'pointsets';
    this._getJSON(path, callback);
  },

  _getPointset: function(pointset) {
    var self = this;
    var path = 'pointsets/' + this._pointset;
    this._getJSON(path, function(pointset) {
      self._pointsetLayer.clearLayers();
      self._pointsetLayer.addData(pointset.features);
    });
  },

  _postJSON: function(path, callback) {
    d3.xhr(this._endpoint + path).post(null, function(error, data) {
      if (data && data.response) {
        callback(JSON.parse(data.response));
      }
    });
  },

  _getJSON: function(path, callback) {
    // Uses D3's json call. TODO: replace with regular JS ajax call?
    d3.json(this._endpoint + path, callback);
  }

});

L.otpaLayer = function (url, options) {
  return new L.OTPALayer(url, options);
};

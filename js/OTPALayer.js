/*
 * Class calls OTP indicators API
 *
 * TODO: make another, abstract class, to make choosing between
 * client-side/server-side classification/binning and rendering abstract/transparent
 */

L.OTPALayer = L.FeatureGroup.extend({

  options: {},

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

    this._pointsetId = options.pointsetId;
    this._pointsetFilters = options.pointsetFilters || {};
    this._pointsetFilterByIsochrones = options.pointsetFilterByIsochrones !== undefined ? options.pointsetFilterByIsochrones: true,

    this._colors = options.colors;
    this._maxWalkDistance = options.maxWalkDistance || 2000;
    this._isochroneStep = options.isochroneStep || 2;

    if (options.location) {
      this._location = L.latLng(options.location);
    }

    options = L.setOptions(this, options);
  },

  addTo: function (map) {
    if (!this._location) {
      this._location = map.getCenter();
    }

    // When layer is added to map, also add LocationLayer
    // TODO: remove locationlayer when this layer is removed!
    this._locationLayer = L.locationLayer(this._location, function(latlng) {
      this.setLocation(latlng);
    }.bind(this)).addTo(map);

    this._isochronesLayer = L.geoJson([], {
      style: function(feature) {
        var style = {
          color: this._colors[0],
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
      }.bind(this)
    }).addTo(map);

    if (this._pointsetId) {
      this._pointsetLayer = L.geoJson(null, {
        pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, this._pointsetStyle(feature.properties));
        }.bind(this)
      }).addTo(map);
    }

    this._createSurface(this._location);

    return this;
  },

  setLocation: function (latlng) {
    this._location = latlng;
    this._createSurface(this._location);
  },

  setPointset: function (pointset) {
    this._pointset = pointset;
    // TODO: check if pointset is in this._pointsets
    this._getIndicator(this._surface.id, this._pointsetId);
  },

  setTimeLimit: function (timeLimit) {
    if (this._indicator && this._isochrones) {
      this._isochronesMinutes = timeLimit;
      this._displayIsochrone(timeLimit);
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
    var path = 'surfaces?'
        + 'fromPlace=' + location.lat + ',' + location.lng
        + '&cutoffMinutes=' + this._cutoffMinutes
        + (this._routerId ? '&routerId=' + this._routerId : '')
        + (this._bannedRoutes ? '&bannedRoutes=' + this._bannedRoutes.join(',') : '')
        + '&maxWalkDistance=' + this._maxWalkDistance
        + '&mode=' + this._modes.join(',')
        + '&batch=true';
    this._postJSON(path, function(json) {
      if (json && json.id) {
        this._surface = json;
        if (this._pointsetId) {
          this._getIndicator(this._surface.id, this._pointsetId);
          this._getPointset(this._pointsetId);
        }
        this._getIsochrones();
      }
    }.bind(this));
  },

  _getIndicator: function(surfaceId, pointsetId) {
    var path = 'surfaces/' + surfaceId
        + '/indicator'
        + '?targets=' + pointsetId;

    this._getJSON(path, function(indicator) {
      this._indicator = indicator;
      this.fireEvent('change', {data: indicator});
    }.bind(this));
  },

  _getIsochrones: function() {
    var path = 'surfaces/' + this._surface.id + '/isochrone?spacing=' + this._isochroneStep;
    this._getJSON(path, function(isochrones) {

      // Index isochrones, keying on time in minutes
      this._isochrones = {};
      isochrones.features.forEach(function(feature) {
        this._isochrones[parseInt(feature.properties.time) / 60] = feature;
      }.bind(this));
      this._displayIsochrone();
    }.bind(this));
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

    this._filterPointsets();
  },

  _filterPointsets: function() {
    if (this._pointset) {
      var filteredFeatures = this._pointset.features
          .filter(function(feature) {
            return Object.keys(this._pointsetFilters).reduce(function(previous, filter) {
              // TODO: check if this._pointsetFilters[filter] == function
              return previous && this._pointsetFilters[filter](feature);
            }.bind(this), true);
          }.bind(this));

      var filteredPointset = {
        type: 'FeatureCollection',
        features: filteredFeatures
      };

      if (this._pointsetFilterByIsochrones) {
        var isochrone = this._isochronesLayer.toGeoJSON();

        // Check wich points are within the isochrones and display
        var filteredPointset = turf.within(filteredPointset, isochrone);
      }

      this._pointsetLayer.clearLayers();
      this._pointsetLayer.addData(filteredPointset);
    }
  },

  _getPointset: function(pointsetId) {
    var path = 'pointsets/' + pointsetId;
    this._getJSON(path, function(pointset) {
      this._pointset = pointset;
    }.bind(this));
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

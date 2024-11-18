var τ = 2 * Math.PI; 
			
var elements = function() {	
		var wind = {
		                field: "vector",
		                type: "wind",
		                description: "Wind",
		                paths: [ "lev_", "_mb" ],
						height: [ "hPa" ],
						boundary: 100,
						coefficient: function(x) { return Math.floor( x ); },
				        builder: function( file ) {
		                    var uData = file[0].data, vData = file[1].data;
		                    return {
		                        header: file[0].header,
		                        interpolate: bilinearInterpolateVector,
		                        data: function(i) {
		                            return [uData[i], vData[i] ];
		                        }
		                    }
		                },
		                units: [
							{label: "m/s",  conversion: function(x) { return x; },            precision: 1},
		                    {label: "km/h", conversion: function(x) { return x * 3.6; },      precision: 0},
		                    {label: "mph",  conversion: function(x) { return x * 2.236936; }, precision: 0}
		                ],
						steps: {
							values: [ [ 300, 250, 200, 150, 100, 50 ] ],
							default: 200
						},
		                scale: {
		                    bounds: [0, 100],
		                    gradient: function(v, a) {
		                        return extendedSinebowColor(Math.min(v, 100) / 100, a);
		                    }
		                },
		                particles: {velocityScale: 1/60000 * window.devicePixelRatio, maxIntensity: 17}
		}
			
	 	var magnetism = {
	                    field: "vector",
	                    type: "magnetism",
	                    description: "Magnetic Flux in nanoteslas",
	                    paths: [ "mag_" ],
						height: ["elevation", "km", "mi." ],
						boundary: 65000,
						coefficient: function(x) { return Math.floor( x * 600 ); },
				        builder: function( file ) {
	                        var uData = file[0].data, vData = file[1].data;
	                        return {
	                            header: file[0].header,
	                            interpolate: bilinearInterpolateVector,
	                            data: function(i) {
	                                return [uData[i] / 600, vData[i] / 600];
	                            }
	                        }
	                    },
	                    units: [
	                        {label: "nT",  conversion: function(x) { return x }, precision: 0}
	                    ],
						steps: {
							values: [ [ 5000, 2500, 1500, 1000, 500, 0 ],							
									  [3000, 1500, 900, 600, 300, 0 ]	],
							default: 1500
						},
	                    scale: {
	                        bounds: [0, 100],
	                        gradient: function(v, a) {
	                            return extendedSinebowColor(Math.min(v, 100) / 100, a);
	                        }
	                    },
	                    particles: {velocityScale: 0.8/60000 * window.devicePixelRatio, maxIntensity: 17}
	}
	
		var oceans = {
		                field: "vector",
		                type: "oceans",
		                description: "Oceans",
		                paths: [ "oceans_" ],
						height: [ "level" ],
						boundary: 1.5,
						coefficient: function(x) { return (x / 100).toFixed(2) ; },
				        builder: function( file ) {
		                    var uData = file[0].data, vData = file[1].data;
		                    return {
		                        header: file[0].header,
		                        interpolate: bilinearInterpolateVector,
		                        data: function(i) {
									var u = uData[i], v = vData[i];
									return isValue(u) && isValue(v) ? [u * 100, v * 100] : null;
		                        }
		                    }
		                },
		                units: [
							{label: "m/s",  conversion: function(x) { return x; },            precision: 1},
		                    {label: "km/h", conversion: function(x) { return x * 3.6; },      precision: 0},
		                    {label: "mph",  conversion: function(x) { return x * 2.236936; }, precision: 0}
		                ],
						steps: {
							values: [ [ "surface" ] ],
							default: "surface"
						},
		                scale: {
		                    bounds: [0, 100],
		                    gradient: segmentedColorScale([
                                [0, [10, 25, 68]],
                                [15, [10, 25, 250]],
                                [40, [24, 255, 93]],
                                [65, [255, 233, 102]],
                                [100, [255, 233, 15]],
                                [150, [255, 15, 15]]
                            ])
		                },
		                particles: {velocityScale: 0.3/60000 * window.devicePixelRatio, maxIntensity: 17 }
	}

    var clouds = {
        field: "n.a.",
        type: "clouds",
        description: "Clouds",
        paths: [ "clouds_" ],
        height: [ "" ],
        boundary: 100,
        steps: {
            values: [ [ "middle layer" ] ],
            default: "middle layer"
        },
        units: [
            {label: "%",  conversion: function(x) { return x; },            precision: 1},
        ],
        builder: di,
        date: cdh
    }
    
	return d3.map({
        wind: wind,
        magnetic_flux: magnetism,
		oceans: oceans,
        clouds: clouds
    });
}();

    function bilinearInterpolateVector(x, y, g00, g10, g01, g11) {
        var rx = (1 - x);
        var ry = (1 - y);
        var a = rx * ry,  b = x * ry,  c = rx * y,  d = x * y;
        var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
        var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
        return [u, v, Math.sqrt(u * u + v * v)];
    }

	//colors
	var BOUNDARY = 0.45;
    var fadeToWhite = colorInterpolator(sinebowColor(1.0, 0), [255, 255, 255]);

    function sinebowColor(hue, a) {
        // Map hue [0, 1] to radians [0, 5/6τ]. Don't allow a full rotation because that keeps hue == 0 and
        // hue == 1 from mapping to the same color.
        var rad = hue * τ * 5/6;
        rad *= 0.75;  // increase frequency to 2/3 cycle per rad

        var s = Math.sin(rad);
        var c = Math.cos(rad);
        var r = Math.floor(Math.max(0, -c) * 255);
        var g = Math.floor(Math.max(s, 0) * 255);
        var b = Math.floor(Math.max(c, 0, -s) * 255);

        return [r, g, b, a];
    }

 	function extendedSinebowColor(i, a) {
        return i <= BOUNDARY ?
            sinebowColor(i / BOUNDARY, a) :
            fadeToWhite((i - BOUNDARY) / (1 - BOUNDARY), a);
    }

	function colorInterpolator(start, end) {
        var r = start[0], g = start[1], b = start[2];
        var Δr = end[0] - r, Δg = end[1] - g, Δb = end[2] - b;
        return function(i, a) {
            return [Math.floor(r + i * Δr), Math.floor(g + i * Δg), Math.floor(b + i * Δb), a];
        };
    }


    function asColorStyle(r, g, b, a) {
        return "rgba(" + r + ", " + g + ", " + b + ", " + a + ")";
    }

    /**
     * @returns {Array} of wind colors and a method, indexFor, that maps wind magnitude to an index on the color scale.
     */
    function windIntensityColorScale(step, maxWind) {
        var result = [];
        for (var j = 85; j <= 255; j += step) {
            result.push(asColorStyle(j, j, j, 1.0));
        }
        result.indexFor = function(m) {  // map wind speed to a style
            return Math.floor(Math.min(m, maxWind) / maxWind * (result.length - 1));
        };
        return result;
    }

  function segmentedColorScale(segments) {
        var points = [], interpolators = [], ranges = [];
        for (var i = 0; i < segments.length - 1; i++) {
            points.push(segments[i+1][0]);
            interpolators.push(colorInterpolator(segments[i][1], segments[i+1][1]));
            ranges.push([segments[i][0], segments[i+1][0]]);
        }

        return function(point, alpha) {
            var i;
            for (i = 0; i < points.length - 1; i++) {
                if (point <= points[i]) {
                    break;
                }
            }
            var range = ranges[i];
            return interpolators[i](proportion(point, range[0], range[1]), alpha);
        };
    }

    /**
     * @returns {Number} the value x clamped to the range [low, high].
     */
    function clamp(x, low, high) {
        return Math.max(low, Math.min(x, high));
    }

    /**
     * @returns {number} the fraction of the bounds [low, high] covered by the value x, after clamping x to the
     *          bounds. For example, given bounds=[10, 20], this method returns 1 for x>=20, 0.5 for x=15 and 0
     *          for x<=10.
     */
    function proportion(x, low, high) {
        return (clamp(x, low, high) - low) / (high - low);
    }


	function buildGrid(element, builder) {

        var header = builder.header;
        var λ0 = header.lo1, φ0 = header.la1;  // the grid's origin (e.g., 0.0E, 90.0N)
        var Δλ = header.dx, Δφ = header.dy;    // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)
        var ni = header.nx, nj = header.ny;    // number of grid points ( 360 * 181 = 65160 ) 
        var date = new Date(header.refTime);
        date.setHours(date.getHours() + header.forecastTime);

        // Scan mode 0 assumed. Longitude increases from λ0, and latitude decreases from φ90.
        // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml
        var grid = [], p = 0;
        var isContinuous = Math.floor(ni * Δλ) >= 360;
        for (var j = 0; j < nj; j++) {
            var row = [];
            for (var i = 0; i < ni; i++, p++) {
				// 360 longitudes, 1 latitude
                row[i] = builder.data(p);
				if ( row[i] == null && j >= 400 ) {
					row[i] = [null, null];
				} 
            }
            if (isContinuous) {
                // For wrapped grids, duplicate first column as last column to simplify interpolation logic
                row.push(row[0]);
            }
            grid[j] = row;
		}
		
		function interpolate(λ, φ) {
            var i = floorMod(λ - λ0, 360) / Δλ;  // calculate longitude index in wrapped range [0, 360)
            var j = (φ0 - φ) / Δφ;                 // calculate latitude index in direction +90 to -90



            //         1      2           After converting λ and φ to fractional grid indexes i and j, we find the
            //        fi  i   ci          four points "G" that enclose point (i, j). These points are at the four
            //         | =1.4 |           corners specified by the floor and ceiling of i and j. For example, given
            //      ---G--|---G--- fj 8   i = 1.4 and j = 8.3, the four surrounding grid points are (1, 8), (2, 8),
            //    j ___|_ .   |           (1, 9) and (2, 9).
            //  =8.3   |      |
            //      ---G------G--- cj 9   Note that for wrapped grids, the first column is duplicated as the last
            //         |      |           column, so the index ci can be used without taking a modulo.

            var fi = Math.floor(i), ci = fi + 1;
            var fj = Math.floor(j), cj = fj + 1;

            var row;
            if ((row = grid[fj])) {
                var g00 = row[fi];
                var g10 = row[ci];
                if (isValue(g00) && isValue(g10) && (row = grid[cj])) {
                    var g01 = row[fi];
                    var g11 = row[ci];
                    if (isValue(g01) && isValue(g11)) {
                        // All four points found, so interpolate the value.
                        return builder.interpolate(i - fi, j - fj, g00, g10, g01, g11);
                    }
                }
            }
            // console.log("cannot interpolate: " + λ + "," + φ + ": " + fi + " " + ci + " " + fj + " " + cj);
            return null;
        }	


          element.date = date,
          element.interpolate = interpolate,
          element.forEachPoint = function(cb) {
                for (var j = 0; j < nj; j++) {
                    var row = grid[j] || [];
                    for (var i = 0; i < ni; i++) {
                        cb( floorMod(180 + λ0 + i * Δλ, 360) - 180, φ0 - j * Δφ, row[i] );
                    }
                }
         }
	return element;
    }

	function floorMod(a, n) {
        var f = a - n * Math.floor(a / n);
        // HACK: when a is extremely close to an n transition, f can be equal to n. This is bad because f must be
        //       within range [0, n). Check for this corner case. Example: a:=-1e-16, n:=10. What is the proper fix?
        return f === n ? 0 : f;
    }

	 function isValue(x) {
        return x !== null && x !== undefined;
    }




var projections = function() {
    "use strict";


    var verifyNumber = ( num, alternate ) => !isNaN( num ) ? num : alternate;

	var max = ( num, otherwise ) => Math.max( Math.floor( num ), otherwise );
	var min = ( num, otherwise ) => Math.min( Math.ceil ( num ), otherwise );

    /**
     * @param bounds the projection bounds: [[x0, y0], [x1, y1]]
     * @param view the view bounds {width:, height:}
     * @returns {Object} the projection bounds clamped to the specified view.
     */
     var clampedBounds = (bounds, view) => {
        var upperLeft = bounds[0];
        var lowerRight = bounds[1];
        var x = max( verifyNumber( upperLeft[0], 0 ), 0) ;
        var y = max( verifyNumber( upperLeft[1], 0 ), 0  );
        var xMax = min( verifyNumber( lowerRight[0], view.width ), view.width - 1);
        var yMax = min(verifyNumber(lowerRight[1], view.height), view.height - 1) ;
        return {x: x, y: y, xMax: xMax, yMax: yMax, width: xMax - x + 1, height: yMax - y + 1};
    }

    /**
     * @class Earth
	 * @param projection
	 * returns an Earth object
     */
    class Earth {
			constructor( projection ) {
	            this.projection = projection;
				this.initialization = false;
			}

            bounds(view) {
                return clampedBounds(d3.geoPath().projection(this.projection).bounds({type: "Sphere"}), view);
            }

            /**
             * @param view the size of the view as {width:, height:}.
             * @returns {Number} the projection scale at which the entire globe fits within the specified view.
             */
            fit(view) {
				this.initialization = true;
                var bounds = d3.geoPath().projection(this.projection).bounds({type: "Sphere"});
                var hScale = (bounds[1][0] - bounds[0][0]) / this.projection.scale();
                var vScale = (bounds[1][1] - bounds[0][1]) / this.projection.scale();
                return Math.min(view.width / hScale, view.height / vScale) * 0.9;
            }

            /**
             * @param view the size of the view as {width:, height:}.
             * @returns {Array} the projection transform at which the globe is centered within the specified view.
             */
            center(view) {
                return [view.width / 2, view.height / 2 ];
            }

            /**
             * @returns {Array} the range at which this globe can be zoomed.
             */
            scaleExtent() {
                return [25, 3000];
            }


            /**
             * Returns an object that mutates this globe's current projection during a drag/zoom operation.
             * Each drag/zoom event invokes the move() method, and when the move is complete, the end() method
             * is invoked.
             *
             * @param startMouse starting mouse position.
             * @param startScale starting scale.
             */
            manipulator(startMouse, startScale ) {
                var bounds = d3.geoPath().projection(this.projection).bounds({type: "Sphere"} );
                var projection = this.projection;
                var sensitivity = 60 / startScale / window.devicePixelRatio;  // seems to provide a good drag scaling factor

                var rotation = [projection.rotate()[0] / sensitivity, -projection.rotate()[1] / sensitivity];
                return {
                    move: function(mouse, scale ) {
                          if (mouse) {
                              var xd = mouse[0] - startMouse[0] + rotation[0];
                              var yd = mouse[1] - startMouse[1] + rotation[1];
            							// AE projection
            							if ( projection.rotate()[1] == "-90" ) {
            								 projection.rotate([xd * sensitivity + -yd * sensitivity / 2, -90 ] );
            							// Conic
            							} else if ( projection.parallels ) {
            								 projection.rotate([xd * sensitivity + -yd * sensitivity / 2, 0, 0]);
            							// Orthographic
            							} else {
            								projection.rotate([xd * sensitivity, -yd * sensitivity, projection.rotate()[2]]);
            							}
                        }
                        projection.scale(scale);
                    }
                };
            }

            /**
             * Draws a polygon on the specified context of this globe's boundary.
             * @param context a Canvas element's 2d context.
             * @returns the context
             */
            defineMask(context) {
                d3.geoPath().projection(this.projection).context(context)({type: "Sphere"});
                return context;
            }

            /**
             * Appends the SVG elements that render this globe.
             * @param mapSvg the primary map SVG container.
             * @param foregroundSvg the foreground SVG container.
             */
            defineMap(mapSvg, foregroundSvg, data) {
	 			var path = d3.geoPath().projection( this.projection );
				var defs = mapSvg.append("defs");
                defs.append("path")
                    .attr("id", "sphere")
                    .datum({type: "Sphere"})
                    .attr("d", path)
					.attr("fill", "#202f36")
					.style("stroke", "black");
				mapSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "background-sphere");
 				mapSvg.append("path")
                    .attr("class", "graticule")
					.attr( "fill", "none" )
                    .datum(d3.geoGraticule())
                    .attr("d", path)
					.style( "stroke", "white")
					.style( "stroke-width", 0.25 );
/*				 mapSvg.append("path")
                    .attr("class", "hemisphere")
                    .datum(d3.geoGraticule().stepMinor([0, 90]).stepMajor([0, 90]))
                    .attr("d", path)
					.attr( "fill", "none" )
					.style( "stroke-width", "1.25")
					.style( "stroke", "#707070");		*/
				mapSvg.append('g')
					  .attr("id", "aap")
					  .selectAll( "path" )
					  .data(data.features)
					  .enter()
					  .append('path')
					  .attr( "d", path )
					  .style( "stroke-width", 1.25 )
					  .style( "stroke", "white")
					  .attr( "fill", "none");
            }
    }


	var azimuthalEquidistant = new Earth( d3.geoAzimuthalEquidistant()
						  .precision(0.1)
						  .rotate([0, -90])
					    .clipAngle(180 - 0.001)
						  );


	var conicAE = new Earth( conicProjection(conicEquidistantRaw)
							    .parallels([90, 90])
								//.rotate( [270, 0, 0] )
								.precision(0.1)
								.center([0, 13.9389]) );

	var orthographic = new Earth( d3.geoOrthographic()
							.precision(0.1).clipAngle(90).rotate([0, 0 ])
							);

	// override center property, since the altered parallels mess up the translate property
	conicAE.center = function( view ) {
            return [view.width / 2, view.height / 1.45 ];
	}


	 function conicEquidistantRaw(y0, y1) {
		  var cy0 = Math.cos(y0),
		      n = y0 === y1 ? Math.sin(y0) : (cy0 - Math.cos(y1)) / (y1 - y0),
		      g = cy0 / n + y0;


		  function project(x, y) {
		    var gy = g - y, nx = n * x;
		    return [gy * Math.sin(nx), g - gy * Math.cos(nx)];
		  }

		   // For some reason the original invert function only returned correct numbers up to 90 parallels, corrected that
		  project.invert = function(x, y) {
		    var gy = g - y;
		    return [Math.atan2(x, gy) / n, g - Math.sign(n) * Math.sqrt(x * x + gy * gy)];
		  };

		  return project;
	}

	function conicProjection(projectAt) {
	  var phi0 = 0,
	      phi1 = Math.PI / 3,
	      m = d3.geoProjectionMutator(projectAt),
	      p = m(phi0, phi1);

	  var radians = Math.PI / 180,
	  degrees = 180 / Math.PI;

	  p.parallels = function(_) {
	    return arguments.length ? m(phi0 = _[0] * radians, phi1 = _[1] * radians) : [phi0 * degrees, phi1 * degrees];
	  };

	  return p;
	}

    return d3.map({
        Azimuthal: azimuthalEquidistant,
        Conic: conicAE,
		Globe: orthographic,
    });

}();

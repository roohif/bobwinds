(function render() {

	const TOPO = "https://gist.githubusercontent.com/d3indepth/f28e1c3a99ea6d84986f35ac8646fac7/raw/c58cede8dab4673c91a3db702d50f7447b373d98/ne_110m_land.json"; // geographical data
	const JSON_BASE = "./grib2/latest/";
	const SUFFIX = ".json";
	const DEFAULT_PROJECTION = "Azimuthal";
    var SECOND = 1000;

    var MINUTE = 60 * SECOND;
    var HOUR = 60 * MINUTE;
    var MAX_TASK_TIME = 100;                  // amount of time before a task yields control (millis)
    var MIN_SLEEP_TIME = 25;                  // amount of time a task waits before resuming (millis)
    var MIN_MOVE = 4;                         // slack before a drag operation beings (pixels)
    var MOVE_END_WAIT = 1000;                 // time to wait for a move operation to be considered done (millis)

	var RATIO = window.devicePixelRatio;
    var OVERLAY_ALPHA = Math.floor(0.4*255);  // overlay transparency (on scale [0, 255])
    var INTENSITY_SCALE_STEP = 10;            // step size of particle intensity color scale
    var MAX_PARTICLE_AGE = 100;               // max number of frames a particle is drawn before regeneration
    var PARTICLE_LINE_WIDTH = 1.0 / RATIO;            // line width of a drawn particle
    var PARTICLE_MULTIPLIER = 7;              // particle count scalar (completely arbitrary--this values looks nice)
    var PARTICLE_REDUCTION = 0.75;            // reduce particle count to this much of normal for mobile devices
    var FRAME_RATE = 40;                      // desired milliseconds per frame

    var NULL_WIND_VECTOR = [NaN, NaN, null];  // singleton for undefined location outside the vector field [u, v, mag]
    var HOLE_VECTOR = [NaN, NaN, null];       // singleton that signifies a hole in the vector field
    var TRANSPARENT_BLACK = [0, 0, 0, 0];     // singleton 0 rgba
    var REMAINING = "▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫";   // glyphs for remaining progress bar
    var COMPLETED = "▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪";   // glyphs for completed progress bar
	var H = 0.0000360;  // 0.0000360°φ ~= 4m
	var PORTRAIT = "portrait";
	var LANDSCAPE = "landscape";
	
	var view = getDimensions();

	var controller = {
		element: elements.get( "wind" ),
		initialized: false,
		refresh: false,
		wind_data: null,
		earth: null,
		grid: null,
		field: null,
		location: null,
		magnitude: null,
		projectionName: null,
		preOrientation: getOrientation(),
		postOrientation: getOrientation()
	};

	var getEarth = ( projectionName ) => {
        var earth = projections.get( projectionName );
	    controller.projectionName = projectionName;

        if (!earth) {
            return ("Unknown projection: " + projectionName);
        }
        return earth;
    }

    var loadJson = ( url ) => {
		return d3.json( url );
    }

 	function isFF() {
        return (/firefox/i).test(navigator.userAgent);
    }

	function getDimensions() {
		var w = window;
		var d = document && document.documentElement;
		var b = document && document.getElementsByTagName("body")[0];
		var x = d.clientWidth || b.clientWidth;
		var y = d.clientHeight || b.clientHeight
		return {width: x, height: y};
	}
	
	function getOrientation() {
		return getDimensions().width > getDimensions().height ? LANDSCAPE : PORTRAIT;
	}
	
    function createMask( earth ) {
        if (!earth) return null;

        // Create a detached canvas, ask the model to define the mask polygon, then fill with an opaque color.
		//TODO fix this crap
        var width = view.width, height = view.height;
        var canvas = d3.select(document.createElement("canvas")).attr("width", width).attr("height", height).node();
        var context = earth.defineMask(canvas.getContext("2d"));
        context.fillStyle = "rgba(151, 193, 245, 1)";
        context.fill();
        //d3.select("#display").node().appendChild(canvas);  // make mask visible for debugging
        var imageData = context.getImageData(0, 0, width, height);
        var data = imageData.data;  // layout: [r, g, b, a, r, g, b, a, ...]
        return {
            imageData: imageData,
            isVisible: function(x, y) {
                var i = (y * width + x) * 4;
                return data[i + 3] > 0;  // non-zero alpha means pixel is visible
            },
            set: function(x, y, rgba) {
                var i = (y * width + x) * 4;
                data[i    ] = rgba[0];
                data[i + 1] = rgba[1];
                data[i + 2] = rgba[2];
                data[i + 3] = rgba[3];
                return this;
            }
        };
    }


    /**
     * Calculate distortion of the wind vector caused by the shape of the projection at point (x, y). The wind
     * vector is modified in place and returned by this function.
     */
    function distort(projection, λ, φ, x, y, scale, wind) {
        var u = wind[0] * scale;
        var v = wind[1] * scale;
        var d = distortion(projection, λ, φ, x, y);

        // Scale distortion vectors by u and v, then add.
        wind[0] = d[0] * u + d[2] * v;
        wind[1] = d[1] * u + d[3] * v;

        return wind;
    }

  function distortion(projection, λ, φ, x, y) {
        var hλ = λ < 0 ? H : -H;
        var hφ = φ < 0 ? H : -H;
        var pλ = projection([λ + hλ, φ]);
        var pφ = projection([λ, φ + hφ]);

		// var k is a correction for the particle movement on the Orthographic's projection mainly and all projection's poles
		var k = controller.projectionName == "Globe" || φ >= 40 ? Math.cos(φ / 360 * τ) : 1;

        return [
            (pλ[0] - x) / hλ / k ,
            (pλ[1] - y) / hλ / k,
            (pφ[0] - x) / hφ,
            (pφ[1] - y) / hφ
        ];
    }

	function interpolateField( earth, grid ) {
        if (!earth || !grid) return null;
        var mask = createMask(earth);
        var primaryGrid = grid;
        var projection = earth.projection;
		// fix this view sh1t
        var bounds = earth.bounds( {width: view.width, height: view.height} );
        // How fast particles move on the screen (arbitrary value chosen for aesthetics).
        var velocityScale = bounds.height * primaryGrid.particles.velocityScale;
        var columns = [];
        var point = [];
        var x = bounds.x;
        var interpolate = primaryGrid.interpolate;
        var scale = primaryGrid.scale;

        function interpolateColumn(x) {
            var column = [];
            for (var y = bounds.y; y <= bounds.yMax; y += 2) {
                if (mask.isVisible(x, y)) {
					point[0] = x; point[1] = y;
                    var coord = projection.invert(point);
                    var color = TRANSPARENT_BLACK;
                    var wind = null;
                    if (coord) {
                        var λ = coord[0], φ = coord[1];

                        if ( isFinite(λ) ) {
                            wind = interpolate(λ, φ);
                            var scalar = null;
                            if (wind) {
                                wind = distort(projection, λ, φ, x, y, velocityScale, wind);
                                scalar = wind[2];
                            }
                            if (isValue(scalar)) {
                                color = scale.gradient(scalar, OVERLAY_ALPHA);
                            }
                        }
                    }
					column[y+1] = column[y] = wind || HOLE_VECTOR;
                    mask.set(x, y, color).set(x+1, y, color).set(x, y+1, color).set(x+1, y+1, color);
                }
            }
            columns[x+1] = columns[x] = column;
        }

       (function batchInterpolate() {
            try {
				if ( controller.refresh ) {
	                var start = Date.now();
	                while (x < bounds.xMax) {
	                    interpolateColumn(x);
	                    x += 2;
	                    if ((Date.now() - start) > MAX_TASK_TIME) {
	                        // Interpolation is taking too long. Schedule the next batch for later and yield.
	                        setTimeout(batchInterpolate, MIN_SLEEP_TIME);
	                        return;
	                    }
	                }
				  if ( !controller.initialized ) {
					  loadJson(TOPO).then( (data) => {
						  svg = d3.select("#map");
						  earth.defineMap( svg, d3.select("#foreground"), data );
					  } );
					  controller.initialized = true;
				   }
	              field = createField(columns, bounds, mask);
				  loading( 3 );
				  controller.field = field;
				  animate( earth, field, grid);
				  drawOverlay( field, grid );
				  loading( 3 );
				stopLoading();
				}
            }
            catch (e) {
                console.log(e);
            }
        })();
    }

function createField(columns, bounds, mask) {

        /**
         * @returns {Array} wind vector [u, v, magnitude] at the point (x, y), or [NaN, NaN, null] if wind
         *          is undefined at that point.
         */
        function field(x, y) {
            var column = columns[Math.round(x)];
            return column && column[Math.round(y)] || NULL_WIND_VECTOR;
        }

        /**
         * @returns {boolean} true if the field is valid at the point (x, y)
         */
        field.isDefined = function(x, y) {
            return field(x, y)[2] !== null;
        };

        /**
         * @returns {boolean} true if the point (x, y) lies inside the outer boundary of the vector field, even if
         *          the vector field has a hole (is undefined) at that point, such as at an island in a field of
         *          ocean currents.
         */
        field.isInsideBoundary = function(x, y) {
            return field(x, y) !== NULL_WIND_VECTOR;
        };

        // Frees the massive "columns" array for GC. Without this, the array is leaked (in Chrome) each time a new
        // field is interpolated because the field closure's context is leaked, for reasons that defy explanation.
        field.release = function() {
            columns = [];
        };

        field.randomize = function(o) {  // UNDONE: this method is terrible
            var x, y;
            var safetyNet = 0;
            do {
                x = Math.round(getRandomArbitrary(bounds.x, bounds.xMax));
                y = Math.round(getRandomArbitrary(bounds.y, bounds.yMax));
            } while (!field.isDefined(x, y) && safetyNet++ < 30);
            o.x = x;
            o.y = y;
            return o;
        };

        field.overlay = mask.imageData;

        return field;
    }

function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

function animate(earth, field, grid) {
        if (!earth || !field || !grid) return;
        var bounds = earth.bounds({width: view.width, height: view.height});
        // maxIntensity is the velocity at which particle color intensity is maximum
        var colorStyles = windIntensityColorScale(INTENSITY_SCALE_STEP, grid.particles.maxIntensity);
        var buckets = colorStyles.map(function() { return []; });
        var particleCount = Math.round(bounds.width * PARTICLE_MULTIPLIER);
/*        if (µ.isMobile()) {
            particleCount *= PARTICLE_REDUCTION;
        }*/
        var fadeFillStyle = isFF() ? "rgba(0, 0, 0, 0.95)" : "rgba(0, 0, 0, 0.97)";  // FF Mac alpha behaves oddly

        var particles = [];
        for (var i = 0; i < particleCount; i++) {
            particles.push(field.randomize({age: Math.floor(Math.random() * MAX_PARTICLE_AGE)}));
        }

        function evolve() {
            buckets.forEach(function(bucket) { bucket.length = 0; });
            particles.forEach(function(particle) {
                if (particle.age > MAX_PARTICLE_AGE) {
                    field.randomize(particle).age = 0;
                }
                var x = particle.x;
                var y = particle.y;
                var v = field(x, y);  // vector at current position

	            var m = v[2];
                if (m === null ) {
                    particle.age = MAX_PARTICLE_AGE;  // particle has escaped the grid, never to return...
                }

                else {
                    var xt = x + v[0];
                    var yt = y + v[1];

					// the Orthographic projection sometimes slings off particles into deep space =), avoid this
					if ( ( Math.abs( xt - x ) > 50 || Math.abs( yt - y ) > 50 ) && ( bounds.width < view.width || bounds.height < view.height ) ) {
						particle.age = MAX_PARTICLE_AGE;
					} else if (field.isDefined(xt, yt)) {
                        // Path from (x,y) to (xt,yt) is visible, so add this particle to the appropriate draw bucket.
                        particle.xt = xt;
                        particle.yt = yt;
                        buckets[colorStyles.indexFor(m)].push(particle);
                    }
                    else {
                        // Particle isn't visible, but it still moves through the field.
                        particle.x = xt;
                        particle.y = yt;
                    }
                }
                particle.age += 1;
            });
        }

        var g = d3.select("#animation").node().getContext("2d");
        g.lineWidth = PARTICLE_LINE_WIDTH;
        g.fillStyle = fadeFillStyle;

        draw = function() {
            // Fade existing particle trails.
            var prev = g.globalCompositeOperation;
            g.globalCompositeOperation = "destination-in";
            g.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            g.globalCompositeOperation = prev;
            // Draw new particle trails.
            buckets.forEach(function(bucket, i) {
                if (bucket.length > 0) {
                    g.beginPath();
                    g.strokeStyle = colorStyles[i];
                    bucket.forEach(function(particle) {
                        g.moveTo(particle.x, particle.y);
                        g.lineTo(particle.xt, particle.yt);
                        particle.x = particle.xt;
                        particle.y = particle.yt;
                    });
                    g.stroke();
                }
            });
        };

        (function frame() {
            try {
				if ( !controller.refresh ) {
					field.release();
				} else {
	                evolve();
	                draw();
               		setTimeout(frame, FRAME_RATE);
				}
            }
            catch (e) {
                console.log( e );
            }
        })();
    }

  function drawOverlay(field, overlayGrid ) {
        if (!field) return;

        var ctx = d3.select("#overlay").node().getContext("2d"), grid = overlayGrid;

        if (overlayGrid) {
            ctx.putImageData(field.overlay, 0, 0, );
        }
	}

	(function execute() {
		var earth = getEarth( DEFAULT_PROJECTION ),
			e = controller.element;
			wind_url = JSON_BASE + e.paths[0] + 1000 + e.paths[1] + SUFFIX;
			//TODO delete
			//wind_url = JSON_BASE + "100mb.json";
		controller.earth = earth;
		drawProjection();
		startAnimation( wind_url );
		setMovementBehaviour();
	})();



	/*
	 * some interactive stuff
	 */
	function setMovementBehaviour() {
		rotate();
		zoom();
	}

	function rotate() {
		var mouse = [0, 0],
			clicked = false,
			moving = false,
			go = true,
			manipulator = null;

		var content = document.getElementById("content");

		function start() {
			//overwrite manipulator with new x y
			manipulator = controller.earth.manipulator(mouse, controller.earth.projection.scale() );
			stopAnimation();
			if ( controller.projectionName == "Globe" ) {
				$(".coordinates .location .close").trigger("click");
			}
		}

		function stop() {
			controller.refresh = true;
			loading(3);
			interpolateField( controller.earth, controller.grid );
		}

		content.onmouseleave = function() {
			if ( clicked ) {
				stop();
				clicked = false;
				moving = false;
				// go true for next click event
				go = true;
			}
		}

		content.onmouseup = function ( e ) {
			var x = e.clientX, y = e.clientY;
			if ( moving ) {
				stop();
			} else {
				// someone clicked without moving (much), show the coordinates and wind speed modal
				if ( controller.field.isDefined( x, y )  ) {
                    var coord = controller.earth.projection.invert([x, y]);
                    var λ = coord[0], φ = coord[1];
                    if ( isFinite(λ) && Math.abs( λ ) >= -89 ) {
                        let speed = controller.grid.interpolate(λ, φ)[2];
						let c = convertCoordinates( coord );
						updateCoordinatesModal(c, adjustUnit( speed ) );
						// add location mark on clicked x y coordinates
						controller.location = coord;
						drawLocationMark();
					}
				}
			}
			clicked = false;
			moving = false;
			go = true;
		}

		content.onmousedown = function(e) {
			clicked = true;
			mouse[0] = e.x, mouse[1] = e.y;
		}

		content.addEventListener( "mousemove", function(e) {
			var currentMouse = [e.x, e.y];

		 	if ( clicked && ( Math.abs( currentMouse[0] - mouse[0] ) > 50 || Math.abs( currentMouse[1] - mouse[1]) > 50 ) ) {
				if ( go ) {
					start();
					go = false;
					moving = true;
					loading(2);
				}
				doMove( currentMouse );
			}


		});

		// mobile devices listeners. Yeah these work better than the computer ones.
		var movement = [];
		content.addEventListener( "touchstart", function(evt) {
			var t = evt.changedTouches[0];
			mouse = [t.pageX, t.pageY];
		});

		content.addEventListener( "touchmove", function(evt){
				var list = evt.changedTouches;
				if ( list.length == 1 ) {
					t = list[0];
					movement.push( t );
					if ( movement.length >= 10 ) {
						start();
						doMove( [t.pageX, t.pageY ] );
					}
				}
		});

		content.addEventListener( "touchend", function(evt) {
			if ( movement.length >= 10 && !controller.refresh ) {
				movement = [];
				stop();
			}
		});

		//inner move function for both movement listeners
		function doMove ( evt ) {
			manipulator.move( evt, controller.earth.projection.scale() );
			var path = d3.geoPath().projection( controller.earth.projection ).pointRadius(1);
			d3.selectAll("path").attr("d", path);
			drawLocationMark( controller.location );
		}
	}

	function zoom() {
		manipulator = null;
				var p = controller.earth.projection;
				var zoomLvl = 1,
					transform = null;
				var zoom = d3.zoom()
				.filter( function() {
					if ( d3.event.type == "mousedown" || d3.event.type == "dblclick" || d3.event.type == "touchstart" && d3.event.touches.length == 1 ) {
						return false;
					}
					if ( d3.event.deltaY < 0 && p.scale() >= 2000 || d3.event.deltaY > 0 && p.scale() <= 50 ) {
						return false;
					}
					return true;
				})
				.on("start", function() {
					manipulator = controller.earth.manipulator( d3.mouse(this), p.scale() );
				})
				.on("zoom", function() {
					loading(1);
					transform = d3.zoomTransform(this);

					if ( transform.k > zoomLvl ){
						manipulator.move( null, p.scale() * 1.1 );
					} else {
						manipulator.move( null, p.scale() * 0.9 );
						bringBackToCenter(p);
					}
					zoomLvl = transform.k;
					stopAnimation();
					//redraw
					d3.selectAll("path").attr("d", d3.geoPath().projection(p) );
					drawLocationMark( controller.location );
				})
				.on("end", function() {
					loading(3);
					buildNewGrid();
				});

		// add zoom handler, implement our own click listener
		d3.select("#foreground").call(zoom);
	}

	function stopAnimation() {
		controller.refresh = false;
		var ctx = d3.select("#overlay").node().getContext("2d");
		ctx.clearRect(0,0, view.width, view.height );
		var ani = d3.select("#animation").node().getContext("2d");
		ani.clearRect(0,0, view.width, view.height );
	}

	function startAnimation( url, resize ) {
		if ( resize ) {
			$( '#content canvas, #content svg' ).css( 'display', 'none' );
		}

		loadJson(url).then( (data) => {
			controller.wind_data = data;			
			if ( resize ) {
				window.dispatchEvent( new Event('resize') );
				$( '#content canvas, #content svg' ).css( 'display', 'block' );
			} else {
				d3.selectAll(".fill-screen").attr("width", view.width).attr("height", view.height);
				buildNewGrid();
			}			
		});
	}

	function buildNewGrid(){
		loading(1);
		controller.previousX = view.width;
		controller.previousY = view.height;
		controller.grid = buildGrid( controller.element, controller.element.builder( controller.wind_data ) );
		loading(3);
		// now the date has been set, so show in panel:
		showDate();
		controller.refresh = true;
		// everything else besides the world map itself is kicked off from inside interpolateField
		interpolateField( controller.earth, controller.grid );
	}

	function showDate(){
		var y = controller.element.date.getUTCFullYear(),
			m = controller.element.date.getUTCMonth() + 1,
			d = controller.element.date.getUTCDate(),
			h = controller.element.date.getUTCHours();

			h = h < 10 ? "0" + h : h;

		$($("#date").children()[1]).text( y + "-" + m + "-" + d + " " + h + ":00" );
	}

	function drawProjection() {
		earth = controller.earth;
		if ( !earth.initialization ) {
			earth.projection.scale( earth.fit( view ) );
			earth.projection.translate( earth.center( view ) );
		}
		loading( 2 );
	}

	// set location information and add some listeners
	function updateCoordinatesModal( location, speed ){
		var u = controller.element.units;
		var i = !controller.element.unit ? 0 : controller.element.unit;
		document.querySelector(".coordinates").classList.add("visible");
		$(".coordinates .location .value").text( location[1] + ", " + location[0] );
		$(".coordinates .velocity .unit").text( " " + u[i].label );
		$(".coordinates .velocity .value").text( speed );
		if ( u.length > 1) {
			document.querySelector(".coordinates .unit").classList.add("selection");
		} else {
			document.querySelector(".coordinates .unit").classList.remove("selection");
		}
	}

	function adjustUnit( speed ) {
		controller.magnitude = controller.element.coefficient( speed );
		var idx = controller.element.unit ? controller.element.unit : 0;
		var m = Number(controller.element.units[idx].conversion( controller.magnitude ) );
		m = controller.element.boundary <= 10 ? m.toFixed(2) : Math.floor( m );		
		return m; // return m instead of controller.magnitude, because m is the current unit's value as opposed to the default unit's one
	}

	// From decimals to degrees and minutes
	function convertCoordinates( coordinates ) {
		var λ = coordinates[0], φ = coordinates[1];

		var long = convert(λ) + ( Math.sign( λ ) >= 0 ? "E" : "W" );
		var lat = convert(φ) +  ( Math.sign( φ ) >= 0 ? "N" : "S" );

		function convert( decimal ) {
			var deg =  Math.floor( Math.abs(decimal) );
			return deg + "° " + Math.floor( ( Math.abs(decimal) - deg ) * 60 ) + "' ";
		}

		return [ long, lat ];
	}

	$(".coordinates .location .close").click( function() {
		document.querySelector(".coordinates").classList.remove("visible");
		d3.select("#foreground .circle").remove();
		controller.location = null;
	});

	$(".coordinates .velocity .unit").click( function() {
		var u = $(this).text().trim(),
			s = $(this).prev();
			units = controller.element.units;

		for (var i = 0; i < units.length; i++ ) {
			if ( u == units[i].label ) {					
					var idx = ( i == units.length - 1 ) ? 0 : i + 1;
					controller.element.unit = idx;
					this.innerHTML = " " + units[idx].label;
					var m = Number(units[idx].conversion( controller.magnitude ) );
					m = controller.element.boundary <= 10 ? m.toFixed(2) : Math.floor( m );
					s.text( m );
					break;
				}
		}


	});

	//draw location mark
	function drawLocationMark( ) {
		if ( coord = controller.location ) {
			var path = d3.geoPath().projection( controller.earth.projection );
			d3.select("#foreground .circle").remove();
								var locationMark = d3.select("#foreground");
								d3.selectAll("circle").attr("d", path);
								locationMark.append("circle")
									.attr("class", "circle")
								    .attr("cx", controller.earth.projection(coord)[0] )
								    .attr("cy", controller.earth.projection(coord)[1] )
								    .attr("r", 7 )
									.style("stroke", "rgb(246, 255, 0)")
									.style("stroke-width", 2 )
								    .attr("fill", "none");
		}
	}

	//update the load bar
	function loading( iterations ) {
		var links = document.querySelector('.links');
		var load = document.querySelector( ".load" );
		iterations = iterations == null ? 1 : iterations;
		for( var i = 1; i <= iterations; i++ ) {
			var block = load.querySelector( ".progress" );
			if ( block ) {

				load.classList.add( "active" );
				block.classList.toggle("progress");
				links.classList.add('hide');
			} else {
				stopLoading();
			}
		}
	}

	function stopLoading() {
		setTimeout(function(){
			var load = document.querySelector( ".load" );
			var links = document.querySelector('.links');
			blocks = document.querySelectorAll(".load .bar div");
			for( var x = 0; x < blocks.length; x++ ) {
				blocks[x].classList.add("progress");
			}
			load.classList.remove( "active" );
			links.classList.remove('hide');
		}, 200 );
	}


	// changelistener for heights, geopgraphy (and relevant units), projections... and yes jQuery is still partially better at this:
	$(".modal .content").find(".option").each( function() {
		this.onclick = function() {
			if ( this.className == "option" ) {
					stopAnimation();
					loading(1);
				if ( this.parentNode.id == "projection"){
					controller.earth = getEarth( this.innerHTML );
					drawProjection();
					// redraw
					if ( controller.projectionName == "Globe" ) {
						$(".coordinates .location .close").trigger("click");
					}
					d3.selectAll("path").attr("d", d3.geoPath().projection( controller.earth.projection ) );
					// wait for the canvas to be cleared
					setTimeout( function() {
						buildNewGrid();
						drawLocationMark();
						setMovementBehaviour();
					}, 100 );
				} else {
					var previousElement = controller.element;
					var data_url = null,
						index = $(this).index() == 1 ? 0 : ( $(this).index() - 1 ) / 2;
					if ( this.parentNode.id == "geography" ) {
						var geo = this.innerHTML.toLowerCase().replace(" ", "_" ),							
							el = controller.element = elements.get( geo ),							
							g = document.querySelector( ".modal .geo" );
							g.innerHTML = this.innerHTML;
						data_url = createDataUrl( el, el.steps.default );						
						// update scale if necessary
						updateScale( geo );
						//set the elevation units:
						$(".modal-line#height").find(".option").each( function(i) {
							this.style.display = el.steps.values[0][i] == undefined ? "none" : "inline";
							$(this).prev().css( "display", this.style.display );
							this.classList.remove("active");
							this.innerHTML = el.steps.values[0][i];
							if ( this.innerHTML == el.steps.default ) {
								this.classList.add( "active" );
							}
						});
						//allow switching metric <> imperial
						setElevationUnit( el );
					}
					if ( this.parentNode.id == "height") {
						var el = controller.element,
						data_url = createDataUrl( el, el.steps.values[0][index] );
					}
					$(".coordinates .location .close").trigger("click");
					if ( controller.element.type == 'clouds' ) {
						controller.element.builder();
						$('#projection span:nth-child(n+3):not(:nth-child(5))').css( 'display', 'none' );
						$($("#date").children()[1]).text( controller.element.date() );
						$('#content').css( 'display', 'none' );
						stopLoading();						
					} else {
						document.querySelector( '#w' ).style.display = 'none';
						document.querySelector( '#content' ).style.display = 'block';						
						$('#projection span').css( 'display', 'inline' );
						let resize = controller.element != previousElement && previousElement.type == 'clouds' && controller.preOrientation != controller.postOrientation;
						// redraw
						d3.selectAll("path").attr("d", d3.geoPath().projection( controller.earth.projection ) );
						setTimeout(function(){
							startAnimation( data_url, resize );	
						}, 20);											
					}
				}
				this.parentNode.querySelector(".active").classList.toggle("active");
				this.classList.toggle("active");
				setCurrentElevation();
				controller.postOrientation = getOrientation();
			}
		}
	});

	//create data url for element el, level lvl
	function createDataUrl( el, lvl ) {
		return JSON_BASE + el.paths[0] + lvl +  (el.paths.length == 1 ? "" : el.paths[1] ) + SUFFIX;
	}

	function setElevationUnit( el ) {
		var n = document.querySelector( ".modal .elevation" );
		if ( el.height.length > 1 ) {
			n.classList.add("selection");
			n.innerHTML = el.height[1];
		} else {
			n.innerHTML = el.height[0];
			n.classList.remove("selection");
		}
	}

	function setCurrentElevation() {
		var e = document.querySelector( ".modal .elevation" ).innerHTML;
			v = document.querySelector( ".modal #height .active").innerHTML,
			u = controller.element.height,
			s = u.length > 1 ? " " + u[0] : "";
		document.querySelector(".modal .altitude").innerHTML = v + " " + e + s;
	}

	//show the wind space when hovering the scale
	var scaleDiv = document.querySelector(".scale");
	var speedModal = document.querySelector("#scale .stalk" );


	scaleDiv.onmouseenter = function() {
		speedModal.style.display = "block";
	}

	scaleDiv.onmouseleave = function() {
		speedModal.style.display = "none";
	}

	function updateScale( ) {
		$( scaleDiv ).removeClass();
		$( scaleDiv).addClass( 'scale ' + controller.element.type );
	}

	document.querySelector(".scale").onmousemove = function(e) {
		var l = this.offsetLeft,
			b = controller.element.boundary;
			m = b / this.offsetWidth,
			x = e.layerX;

		var speed = 0;
		if ( x ) {
			speed =  ( x - l ) * m;
		} else {
			x = e.target.offsetLeft - 134 + e.offsetX;
			speed = ( e.target.offsetLeft - 134 + e.offsetX ) * m ;
		}

		speed = speed > b ? b : speed;
		var limit = b * 0.8333;;
		if ( speed < limit ) {
			speedModal.style.left = x - 30 + "px";
		} else {
			speedModal.style.left = x - 30 - ( ( speed - limit ) / m )  + "px";
		}

		var u = controller.element.units,
			boundary = controller.element.boundary,
			stalker = document.querySelector(".stalk .tablet");
		$(stalker).find("div").remove();
		stalker.style.height = u.length * 18 + "px";
		for ( var i = 0; i < u.length; i++ ) {
			var d = document.createElement("div");
				s = document.createElement("span"),
				v = u[i].conversion( speed );
			s.innerHTML = " " + u[i].label;
			d.innerHTML = boundary <= 10 ? v.toFixed(2) : Math.floor( v );
			d.appendChild( s );
			stalker.appendChild( d );
		}

		stalker.querySelectorAll("div").forEach( function(e) {
			e.style.color = speed < b * 0.2777 ? "#fff" :
							   speed < b * 0.4722 ? "rgb( 255, 225, 54 )" : "#ed5b00";
		});
	}

	//about modal, jQuery is better again
	$("#about-link").click( function() {
		var a =	document.querySelector(".about");
		a.classList.toggle("opened");
		toggleVisibility( $(a).css("display") == "none", this.parentNode );		
	});

	// show/hide modal lines
	function toggleVisibility( visible, skip ) {
		var iteration = visible ? 7 : 1,
			time = visible ? 100 : 75,
			height = visible ? (getDimensions().height <= 400 ? '9vh' : '40px') : 0,
			visibility = visible? "visible" : "hidden",
			bottom = visible ? "10px" : (getDimensions().height <= 400 ? '-63vh' : '-280px');

		$(".modal-line").each( function() {
			if ( this != skip ) {
				$(this).css("height", height );
				var m = $(this);
				setTimeout( function() {
					m.children().each( function() {
						$(this).css("visibility", visibility );
					});
				}, time * iteration );
				if ( visible ) {
					iteration--;
				} else {
					iteration++
				}
			}
		});

		$(".modal").css("bottom", bottom );
	}

	// close the 'about' modal on request
	document.addEventListener( "click", function(e) {
		if ( $(".about").css("display") == "block" && $(".about").find( $(e.target) ).length == 0 && e.target.id != "about-link" ) {
			document.querySelector(".about").classList.toggle("opened");	
			toggleVisibility( true, null );
		}
		if ($("#about").find( $(e.target) ).length == 0 && e.target.id != "x2e6389" ) {
			$("#about").removeClass( "show" );			
		}

		let modals = $(".about.opened, #about.show" );
		if ( modals.length > 0 || $('.modal .content:not(.invisible)').length > 0 && view.height < 400 ) {
			document.querySelector('.links').classList.add( 'hide' );
		} else {
			document.querySelector('.links').classList.remove( 'hide' );
		}
	});	

	document.querySelector(".about .close").onclick = function () {
		document.querySelector(".about").classList.toggle("opened");
		document.querySelector(".links").classList.toggle("hide");
		toggleVisibility( true, null );
	}


	// 'menu toggler' hover and click settings
	$(".toggler .hamburger, .toggler .menu").hover( function() {
		document.querySelector(".modal .toggler").classList.toggle("hovered");
	});


	$(".toggler .hamburger, .toggler .menu").click( function() {
		if ( $(".about").css("display") == "block" ) {
			$("#about-link").trigger("click");
			return false;
		}
		document.querySelector( ".modal .content" ).classList.toggle("invisible");
		document.querySelector('.links').classList.toggle( 'hide' );
	});

	$(".modal #height .elevation").click( function () {
		if ( this.className != "elevation" ) {
			var el = controller.element, h = el.height;
			for ( let i = 0; i < h.length; i++ ) {
				if ( this.innerHTML == h[i] ) {
					var idx = ( i == h.length - 1 ) ? 1 : i + 1;
					this.innerHTML = h[idx];
					$(".modal #height .option").each( function(i) {
						this.innerHTML = el.steps.values[idx-1][i];
					});
					setCurrentElevation();
					break;
				}
			}
		}
	});

  // drag behavior when zoomed in, Azimuthal projection only
	var dragged = false;
	var startTranslation;
	var translationHistory = [];
	d3.select('#foreground')
	  .call(d3.drag()
						.on('drag', dragging)
						.on('end', dragEnd)
						.filter( () => {
							return controller.earth.projection.scale() * (RATIO * .75) >= 300 &&
										 controller.projectionName == "Azimuthal";
		}));

	function dragEnd() {
		if (!dragged) {
			document.getElementById('content').dispatchEvent(
				new MouseEvent('mouseup', {
					clientX: d3.event.sourceEvent.clientX,
					clientY: d3.event.sourceEvent.clientY,
					bubbles: false
				}));
		} else {
			loading(3);
			buildNewGrid();
		}
		dragged = false;
	}

	function dragging(e) {
		if ( Math.abs( d3.event.dx) < 5 && Math.abs( d3.event.dy ) < 5 ) return;

		// remove location mark first
		d3.select("#foreground .circle").remove();

		let p = controller.earth.projection,
		    [lon, lat] = p.translate(),
				bounds = d3.geoPath().projection(controller.earth.projection).bounds({type: "Sphere"});
		lon = lon + d3.event.dx;
		lat = lat + d3.event.dy;

		if ( lat > (bounds[1][1] - bounds[0][1]) / 2 || d3.event.dy < 0 && bounds[1][1] < view.height ) {
			lat-=d3.event.dy;
		}
		if ( lon > (bounds[1][0] - bounds[0][0]) / 2 || d3.event.dx < 0 && bounds[1][0] < view.width ) {
			lon-= d3.event.dx;
		}

		if ( !startTranslation) startTranslation = translationHistory[0] = p.translate();

		p.translate([lon,lat]);
		translationHistory.push(p.translate());
		if ( translationHistory.length > 5 ) translationHistory.pop();
		dragged = true;

		stopAnimation();
		//redraw
		d3.selectAll("path").attr("d", d3.geoPath().projection(p) );
	}

	// bring back projection to center when zooming out
	function bringBackToCenter(projection) {
		const baseScale = 150;
		let p = projection,
				[lon, lat] = p.translate(),
				scale = p.scale();

		if ( controller.projectionName != "Azimuthal" || ! startTranslation ) return;

		if ( scale <= baseScale || lon == startTranslation[0] && lat == startTranslation[1]  ){
			translationHistory = [startTranslation];
			return;
		};

		let percentage = 100 - baseScale / scale * 100;
		let historyIndex = Math.max(0, Math.floor(translationHistory.length * percentage / 100 - 1));
		p.translate(translationHistory[historyIndex]);
	}

	d3.select('.modal').call( d3.drag().on('end', function() {
		let distance = d3.event.y - d3.event.subject.y;
		if ( distance > view.height * .03 ) {

		  $('.toggler .menu').trigger('click');
		}
	}));

	document.querySelector( '#x2e6389').addEventListener('click', function() {
		if ( !document.querySelector('.modal .content').classList.contains( 'invisible' ) ) {
			document.querySelector('.toggler .menu').dispatchEvent( new Event('click') );
		}		
	});

	window.onresize = function() {
		if ( controller.element.type == 'clouds' ) {
			controller.preOrientation = getOrientation();
			return;
		}

		controller.postOrientation = getOrientation();
		view = getDimensions();
		$('#content canvas').each((i,c) => {
			c.width = view.width;
			c.height = view.height;
		});
		
		$('svg').each((i,svg) => {
			$(svg).empty();
			svg.setAttribute('width', view.width);
			svg.setAttribute('height', view.height);
		});
		stopAnimation();
		controller.earth.initialization = controller.initialized = false;
		drawProjection();
		setTimeout( function() {			
			buildNewGrid();
			drawLocationMark();
			setMovementBehaviour();
		}, 50 ); 

		$(".modal-line").each( function() {
			$(this).css("height", getDimensions().height <= 400 ? '9vh' : '40px' );
		});
		if ( !$(".modal").css("bottom") == '10px' ) {
			$(".modal").css("bottom", (getDimensions().height <= 400 ? '-63vh' : '-280px') );
		}
	}
})();

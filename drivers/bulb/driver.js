'use strict';

const Driver	= require('../../lib/Driver.js');

const typeCapabilityMap 	= {
	'on/off light'				: [ 'onoff' ],
	'dimmable light'			: [ 'onoff', 'dim' ],
	'dimmable plug-in unit'		: [ 'onoff', 'dim' ],
	'color temperature light'	: [ 'onoff', 'dim', 'light_temperature' ],
	'color light'				: [ 'onoff', 'dim', 'light_hue', 'light_saturation' ],
	'extended color light'		: [ 'onoff', 'dim', 'light_hue', 'light_saturation', 'light_temperature', 'light_mode' ],
}
const defaultIcon 			= 'LCT001';
const iconsMap				= {
	'LCT001'	: 'LCT001',
	'LCT007'	: 'LCT001',
	'LCT002'	: 'LCT002',
	'LCT003'	: 'LCT003',
	'LST001'	: 'LST001',
	'LLC010'	: 'LLC010',
	'LLC011'	: 'LLC011',
	'LLC012'	: 'LLC011',
	'LLC006'	: 'LLC010',
	'LLC007'	: 'LLC007',
	'LLC013'	: 'LLC013',
	'LWB004'	: 'LCT001',
	'LWB006'	: 'LCT001',
	'LWB007'	: 'LCT001',
	'LLM001'	: defaultIcon,
	'LLM010'	: defaultIcon,
	'LLM011'	: defaultIcon,
	'LLM012'	: defaultIcon,
	'LLC020'	: 'LLC020',
	'LST002'	: 'LST001'
}

const capabilityMap			= {
	'onoff'				: 'on',
	'dim'				: 'brightness',
	'light_hue'			: 'hue',
	'light_saturation'	: 'saturation',
	'light_temperature'	: 'colorTemp',
	'light_mode'		: 'colorMode'
}

const defaultTransitionTime = 0.5;

class DriverBulb extends Driver {

	constructor() {
		super();

		this._deviceType = 'light';

		this.capabilities = {};

		this.capabilities.onoff = {};
		this.capabilities.onoff.get = this._onExportsCapabilitiesOnoffGet.bind(this);
		this.capabilities.onoff.set = this._onExportsCapabilitiesOnoffSet.bind(this);

		this.capabilities.dim = {};
		this.capabilities.dim.get = this._onExportsCapabilitiesDimGet.bind(this);
		this.capabilities.dim.set = this._onExportsCapabilitiesDimSet.bind(this);

		this.capabilities.light_hue = {};
		this.capabilities.light_hue.get = this._onExportsCapabilitiesLightHueGet.bind(this);
		this.capabilities.light_hue.set = this._onExportsCapabilitiesLightHueSet.bind(this);

		this.capabilities.light_saturation = {};
		this.capabilities.light_saturation.get = this._onExportsCapabilitiesLightSaturationGet.bind(this);
		this.capabilities.light_saturation.set = this._onExportsCapabilitiesLightSaturationSet.bind(this);

		this.capabilities.light_temperature = {};
		this.capabilities.light_temperature.get = this._onExportsCapabilitiesLightTemperatureGet.bind(this);
		this.capabilities.light_temperature.set = this._onExportsCapabilitiesLightTemperatureSet.bind(this);

		this.capabilities.light_mode = {};
		this.capabilities.light_mode.get = this._onExportsCapabilitiesLightModeGet.bind(this);
		this.capabilities.light_mode.set = this._onExportsCapabilitiesLightModeSet.bind(this);

		Homey
			.manager('flow')
			.on('action.shortAlert', this._onFlowActionShortAlert.bind(this))
			.on('action.longAlert', this._onFlowActionLongAlert.bind(this))
			.on('action.startColorLoop', this._onFlowActionStartColorLoop.bind(this))
			.on('action.stopColorLoop', this._onFlowActionStopColorLoop.bind(this))
			.on('action.setRandomColor', this._onFlowActionSetRandomColor.bind(this))
			.on('action.brightnessIncrement', this._onFlowActionBrightnessIncrement.bind(this))

	}

	static convertValue( capabilityId, direction, value ) {

		if( capabilityId === 'dim' || capabilityId === 'light_saturation'  ) {
			if( direction === 'get' ) {
				return value / 254;
			} else 	if( direction === 'set' ) {
				return Math.round( value * 254 );
			}
		} else if( capabilityId === 'light_hue' ) {
			if( direction === 'get' ) {
				return value / 65535;
			} else if( direction === 'set' ) {
				return Math.round( value * 65535 );
			}
		} else if( capabilityId === 'light_temperature' ) {
			if( direction === 'get' ) {
				return ( value - 153 ) / ( 500 - 153 );
			} else if( direction === 'set' ) {
				return Math.round( 153 + value * ( 500 - 153 ) );
			}
		} else if( capabilityId === 'light_mode' ) {
			if( direction === 'get' ) {
				return ( value === 'ct' ) ? 'temperature' : 'color'
			}
		} else {
			return value;
		}

	}

	_syncDevice( device_data ) {
		this.debug('_syncDevice', device_data.id);

		let device = this.getDevice( device_data );
		if( device instanceof Error )
			return module.exports.setUnavailable( device_data, __('unreachable') );

		let deviceInstance = this.getDeviceInstance( device_data );
		if( deviceInstance instanceof Error )
			return module.exports.setUnavailable( device_data, __('unreachable') );

		module.exports.setAvailable( device_data );

		// sync values to internal state
		for( let capabilityId in device.state ) {

			// prevent dim from going to 0 if device is off
			if( capabilityId === 'dim' && device.state['onoff'] === false ) {
				if( device.state[ capabilityId ] === null ) {
					device.state[ capabilityId ] = 1;
					module.exports.realtime( device_data, capabilityId, device.state[ capabilityId ] );
				}
				continue;
			}

			let value = deviceInstance[ capabilityMap[ capabilityId ] ];
			if( typeof value !== 'undefined' ) {
				let convertedValue = DriverBulb.convertValue( capabilityId, 'get', value );
				device.state[ capabilityId ] = convertedValue;
				module.exports.realtime( device_data, capabilityId, device.state[ capabilityId ] );
			}
		}

	}

	_onBeforeSave( device_data ) {

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return this.error( device );

		for( let capabilityId in device.state ) {

			// light_mode is not setable
			if( capabilityId === 'light_mode' ) continue;

			// skip null values
			let value = device.state[ capabilityId ];
			if( value === null ) continue;

			// only set properties that belong to the right light_mode, this enables switching of light_mode
			if( typeof device.state.light_mode === 'string' ) {

				if( device.state.light_mode === 'color' ) {
					if( capabilityId === 'light_temperature' ) continue;
				} else if( device.state.light_mode === 'temperature' ) {
					if( capabilityId === 'light_hue' || capabilityId === 'light_saturation' ) continue;
				}

			}

			let convertedValue = DriverBulb.convertValue( capabilityId, 'set', value );
			device.setInstanceProperty( capabilityMap[ capabilityId], convertedValue );
		}

		if (device.setInstanceProperties.hasOwnProperty('transitionTime')) {
			setTimeout(() => { device.setInstanceProperty('transitionTime', defaultTransitionTime) }, 100);
		} else {
			device.setInstanceProperty('transitionTime', defaultTransitionTime);
		}

	}

	_onExportsPairListDevices( state, data, callback ) {

		if( !state.bridge )
			return callback( 'invalid_bridge' );

		if( state.bridge instanceof Error )
			return callback( state.bridge );

		let result = [];

		for( let light of state.bridge.getLights() ) {

			let deviceCapabilities = typeCapabilityMap[ light.type.toLowerCase() ];
			if( !Array.isArray( deviceCapabilities ) ) return;

			let deviceObj = {
				name			: light.name,
				data 			: this.getDeviceData( state.bridge, light ),
				capabilities	: deviceCapabilities
			};

			if( typeof iconsMap[ light.modelId ] === 'string' ) {
				deviceObj.icon = `/icons/${iconsMap[light.modelId]}.svg`;
			}

			result.push( deviceObj );

		}

		callback( null, result );

	}

	_onExportsCapabilitiesOnoffGet( device_data, callback ) {
		this.debug('_onExportsCapabilitiesOnoffGet', device_data.id);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		callback( null, device.state.onoff );
	}

	// onoff
	_onExportsCapabilitiesOnoffSet( device_data, value, callback ) {
		this.debug('_onExportsCapabilitiesOnoffSet', device_data.id, value);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		device.state.onoff = value;

		device.setInstanceProperty('effect', 'none');
		device.save( callback );
	}

	// dim
	_onExportsCapabilitiesDimGet( device_data, callback ) {
		this.debug('_onExportsCapabilitiesDimGet', device_data.id);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		callback( null, device.state.dim );
	}

	_onExportsCapabilitiesDimSet( device_data, value, callback ) {
		this.debug('_onExportsCapabilitiesDimSet', device_data.id, value);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		device.state.dim = value;
		device.state.onoff = ( value > 0 );
		module.exports.realtime( device_data, 'onoff', device.state.onoff );

		device.setInstanceProperty('effect', 'none');
		device.save( callback );
	}

	// light_hue
	_onExportsCapabilitiesLightHueGet( device_data, callback ) {
		this.debug('_onExportsCapabilitiesLightHueGet', device_data.id);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		callback( null, device.state.light_hue );
	}

	_onExportsCapabilitiesLightHueSet( device_data, value, callback ) {
		this.debug('_onExportsCapabilitiesLightHueSet', device_data.id, value);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		device.state.light_hue = value;

		if( typeof device.state.light_mode !== 'undefined' ) {
			device.state.light_mode = 'color';
			module.exports.realtime( device_data, 'light_mode', device.state.light_mode );
		}

		device.setInstanceProperty('effect', 'none');
		device.save( callback );

	}

	// light_saturation
	_onExportsCapabilitiesLightSaturationGet( device_data, callback ) {
		this.debug('_onExportsCapabilitiesLightSaturationGet', device_data.id);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		callback( null, device.state.light_saturation );
	}

	_onExportsCapabilitiesLightSaturationSet( device_data, value, callback ) {
		this.debug('_onExportsCapabilitiesLightSaturationSet', device_data.id, value);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		device.state.light_saturation = value;

		if( typeof device.state.light_mode !== 'undefined' ) {
			device.state.light_mode = 'color';
			module.exports.realtime( device_data, 'light_mode', device.state.light_mode );
		}

		device.setInstanceProperty('effect', 'none');
		device.save( callback );
	}

	// light_temperature
	_onExportsCapabilitiesLightTemperatureGet( device_data, callback ) {
		this.debug('_onExportsCapabilitiesLightTemperatureGet', device_data.id);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		callback( null, device.state.light_temperature );
	}

	_onExportsCapabilitiesLightTemperatureSet( device_data, value, callback ) {
		this.debug('_onExportsCapabilitiesLightTemperatureSet', device_data.id, value);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		device.state.light_temperature = value;

		if( typeof device.state.light_mode !== 'undefined' ) {
			device.state.light_mode = 'temperature';
			module.exports.realtime( device_data, 'light_mode', device.state.light_mode );
		}

		device.setInstanceProperty('effect', 'none');
		device.save( callback );
	}

	// light_mode
	_onExportsCapabilitiesLightModeGet( device_data, callback ) {
		this.debug('_onExportsCapabilitiesLightModeGet', device_data.id);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		callback( null, device.state.light_mode );
	}

	_onExportsCapabilitiesLightModeSet( device_data, value, callback ) {
		this.debug('_onExportsCapabilitiesLightModeSet', device_data.id, value);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		device.state.light_mode = value;
		device.save( callback );
	}

	/*
		Flow methods
	*/
	_onFlowActionShortAlert( callback, args, state ) {

		let device = this.getDevice( args.device );
		if( device instanceof Error ) return callback( device );

		device.setInstanceProperty('alert', 'select');
		device.setInstanceProperty('effect', 'none');
		device.save( callback );

	}

	_onFlowActionLongAlert( callback, args, state ) {

		let device = this.getDevice( args.device );
		if( device instanceof Error ) return callback( device );

		device.setInstanceProperty('alert', 'lselect');
		device.setInstanceProperty('effect', 'none');
		device.save( callback );

	}

	_onFlowActionStartColorLoop( callback, args, state ) {

		let device = this.getDevice( args.device );
		if( device instanceof Error ) return callback( device );

		device.setInstanceProperty('alert', 'none');
		device.setInstanceProperty('effect', 'colorloop');
		device.save( callback );

	}

	_onFlowActionStopColorLoop( callback, args, state ) {

		let device = this.getDevice( args.device );
		if( device instanceof Error ) return callback( device );

		device.setInstanceProperty('alert', 'none');
		device.setInstanceProperty('effect', 'none');
		device.save( callback );

	}

	_onFlowActionSetRandomColor( callback, args, state ) {

		let device = this.getDevice( args.device );
		if( device instanceof Error ) return callback( device );

		var onoff = true;
		var saturation = 1;
		var hue = Math.random();

		this._onExportsCapabilitiesOnoffSet( args.device, onoff, function(){});
		this._onExportsCapabilitiesLightSaturationSet( args.device, saturation, function(){});
		this._onExportsCapabilitiesLightHueSet( args.device, hue, callback);

		device.setInstanceProperty('effect', 'none');
		device.save( callback );

	}

	_onFlowActionBrightnessIncrement( callback, args, state ) {

		let device = this.getDevice( args.device );
		if( device instanceof Error ) return callback( device );

		device.setInstanceProperty('transitionTime', args.trans);

		this._onExportsCapabilitiesDimSet( args.device, args.brightness/100, callback );
	}

}

module.exports = new DriverBulb();

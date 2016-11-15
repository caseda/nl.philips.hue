"use strict";

const events		= require('events');
const huejay 		= require('huejay');
const Bridge		= require('./lib/Bridge.js');

const findBridgesInterval = 60000;

class App extends events.EventEmitter {

	constructor() {
		super();

		this._bridges = {};

		this.init = this._onExportsInit.bind(this);

		Homey.manager('flow').on('action.setScene', this._onFlowActionSetScene.bind(this));
		Homey.manager('flow').on('action.setScene.scene.autocomplete', this._onFlowActionSetSceneSceneAutocomplete.bind(this));
		Homey.manager('flow').on('action.allOff', this._onFlowActionAllOff.bind(this));
		Homey.manager('flow').on('action.allOff.group.autocomplete', this._onFlowActionAllOffGroupAutocomplete.bind(this));

	}

	/*
		Helper methods
	*/
	log() {
		console.log.bind(this, '[log]' ).apply( this, arguments );
	}

	error() {
		console.error.bind( this, '[error]' ).apply( this, arguments );
	}

	/*
		Bridge methods
	*/
	findBridges() {

		[ 'nupnp', 'upnp' ].forEach(( strategy ) => {
			huejay.discover({
				strategy: strategy
			})
				.then(( bridges ) => {
					this.log(`Discovered ${bridges.length} ${strategy} bridges`);
					bridges.forEach( this._initBridge.bind(this) );
				})
				.catch(( err ) => {
					this.error( err );
				})
		});

	}

	_initBridge( bridge ) {

		bridge.id = bridge.id.toLowerCase();

		// skip if already found
		if( this._bridges[ bridge.id ] instanceof Bridge ) return;

		this.log(`Found bridge ${bridge.id} @ ${bridge.ip}`);

		this._bridges[ bridge.id ] = new Bridge( bridge.id, bridge.ip );
		this._bridges[ bridge.id ]
			.on('log', this.log.bind( this, `[${bridge.id}]`) )
			.on('error', this.error.bind( this, `[${bridge.id}]`) )
			.on('bridge_available', () => {
				this.emit('bridge_available', this._bridges[ bridge.id ] );
			})
			.init()
	}

	getBridges() {
		return this._bridges;
	}

	getBridge( bridgeId ) {
		if( typeof bridgeId !== 'string' ) return new Error('invalid_bridge');
		return this._bridges[ bridgeId.toLowerCase() ] || new Error('invalid_bridge');
	}

	/*
		Export methods
	*/
	_onExportsInit() {

		console.log(`${Homey.manifest.id} running...`);

		this.findBridges();
		setInterval( this.findBridges.bind(this), findBridgesInterval );

	}

	/*
		Flow methods
	*/
	_onFlowActionSetScene( callback, args, state ) {

		let bridge = this.getBridge( args.scene.bridge_id );
		if( bridge instanceof Error ) return callback( bridge );

		bridge.setScene( args.scene.id )
			.then(() => {
				callback();
			})
			.catch( callback );

	}
	_onFlowActionSetSceneSceneAutocomplete( callback, args, state ) {

		if( Object.keys( this._bridges ).length < 1 )
			return callback( new Error( __("no_bridges") ) );

		let calls = [];

		for( let bridgeId in this._bridges ) {
			let bridge = this._bridges[ bridgeId ];

			let call = bridge.getScenes()
				.then((scenes) => {
					return {
						bridge: bridge,
						scenes: scenes
					}
				})
				.catch((err) => {
					this.error( err );
					return err;
				})
			calls.push( call );

		}

		Promise.all( calls ).then(( results ) => {

			let resultArray = [];

			results.forEach((result) => {
				if( result instanceof Error ) return;

				let bridge = result.bridge;
				result.scenes.forEach((scene) => {
					resultArray.push({
						bridge_id			: bridge.id,
						name				: scene.name.split(' on ')[0],
						id					: scene.id,
						description			: bridge.name,
						description_icon	: bridge.icon
					})
				});
			});

			resultArray = resultArray.filter(( resultArrayItem ) => {
				return resultArrayItem.name.toLowerCase().indexOf( args.query.toLowerCase() ) > -1;
			});

			callback( null, resultArray );
		});

	}

	_onFlowActionAllOff( callback, args, state ) {

		let bridge = this.getBridge( args.group.bridge_id );
		if( bridge instanceof Error ) return callback( bridge );

		bridge.getGroup( args.group.id )
			.then(( group ) => {
				group.on = false;
				bridge.saveGroup( group )
					.then(() => {
						callback();

						let lights = bridge.getLights();
						let driver = Homey.manager('drivers').getDriver('bulb');

						for( let light of lights ) {
							light.on = false;
							driver.realtime( driver.getDeviceData( bridge, light ), 'onoff', false );
						}

					})
					.catch( callback );
			})
			.catch( callback );

	}

	_onFlowActionAllOffGroupAutocomplete( callback, args ) {

		if( Object.keys( this._bridges ).length < 1 )
			return callback( new Error( __("no_bridges") ) );

		let calls = [];

		for( let bridgeId in this._bridges ) {
			let bridge = this._bridges[ bridgeId ];

			let call = bridge.getGroups()
				.then((groups) => {
					return {
						bridge: bridge,
						groups: groups
					}
				})
				.catch((err) => {
					this.error( err );
					return err;
				})
			calls.push( call );

		}

		Promise.all( calls ).then(( results ) => {

			let resultArray = [];

			results.forEach((result) => {
				if( result instanceof Error ) return;

				let bridge = result.bridge;

				resultArray.push({
					bridge_id			: bridge.id,
					name				: __('all_lights'),
					id					: 0,
					description			: bridge.name,
					description_icon	: bridge.icon
				});

				result.groups.forEach((group) => {
					resultArray.push({
						bridge_id			: bridge.id,
						name				: group.name,
						id					: group.id,
						description			: bridge.name,
						description_icon	: bridge.icon
					})
				});

			});

			resultArray = resultArray.filter(( resultArrayItem ) => {
				return resultArrayItem.name.toLowerCase().indexOf( args.query.toLowerCase() ) > -1;
			});

			callback( null, resultArray );
		});

	}

}

module.exports = new App();
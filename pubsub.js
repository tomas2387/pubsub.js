(function(scope) {
	/* global global,define */
	'use strict';
	var pubsubInstance;
	var pubsubConfig = null;

	if(typeof pubsub === 'object') {
		pubsubConfig = pubsub;
	//node.js config from global
	} else if(typeof global === 'object' && typeof global.pubsubConfig === 'object') {
		pubsubConfig = global.pubsubConfig;
	}

	function Pubsub(config) {
		var _eventObject = {};
		var _steroidsEvents = {};
		var options = {
			separator : (config && config.separator) ? config.separator : '/',
			recurrent : (config && typeof config.recurrent === 'boolean') ? config.recurrent : (false),
			depth     : (config && typeof config.depth === 'number') ? config.depth : null,
			async     : (config && typeof config.async === 'boolean') ? config.async : (false),
			context   : (config && config.context) ? config.context : null,
			log       : (config && config.log) ? config.log : (false)
		};

		function forEach(dataArray, callback) {
			var arrayLength = dataArray.length;

			for(var i = 0; i < arrayLength; i++) {
				callback(i, dataArray[i]);
			}
		}

		function executeCallback(subscriptions, args, async) {
			async = (typeof async === 'boolean') ? async : options.async;
			if(!subscriptions.length) {
				return;
			}

			// clone array - callbacks can unsubscribe other subscriptions
			// reduces a lot performance but is safe
			var executedSubscriptions = subscriptions.slice();

			forEach(executedSubscriptions, function(subscriptionId, subscription) {
				if(typeof subscription === 'object' && executedSubscriptions.hasOwnProperty(subscriptionId)) {
					if(async) {
						setTimeout(function() {
							subscription.callback.apply(subscription.context, args);
						}, 4);
					} else {
						subscription.callback.apply(subscription.context, args);
					}
				}
			});
		}

		function executePublishWildcard(nsObject, args) {
			var nsElement;
			for(nsElement in nsObject) {
				if(nsElement[0] !== '_' && nsObject.hasOwnProperty(nsElement)) {
					executeCallback(nsObject[nsElement]._events, args);
				}
			}
		}

		function publish(nsObject, args, parts, params) {
			// work on copy - not on reference
			parts = parts.slice();

			var iPart = parts.shift();
			var depth = params.depth;
			var async = params.async;
			var partsLength = params.partsLength;
			var recurrent = params.recurrent;
			var partNumber = (partsLength - parts.length);

			// parts is empty
			if(!iPart) {
				executeCallback(nsObject._events, args, async);
				return;
			}
			// handle subscribe wildcard
			if(typeof nsObject['*'] !== 'undefined') {
				publish(nsObject['*'], args, parts, params);
			}

			// handle publish wildcard
			if(iPart === '*') {
				executePublishWildcard(nsObject, args, async);
			}

			// no namespace = leave publish
			if(typeof nsObject[iPart] === "undefined") {
				if(params.log) {
					console.warn('There is no ' + params.nsString + ' subscription');
				}
				return;
			}

			nsObject = nsObject[iPart];

			if(recurrent === true && typeof depth !== 'number') { //depth is not defined
				executeCallback(nsObject._events, args, async);
				if(parts.length === 0) {
					return;
				}
			} else if(recurrent === true && typeof depth === 'number' && partNumber >= (partsLength - depth)) { //if depth is defined
				executeCallback(nsObject._events, args, async);
			}

			publish(nsObject, args, parts, params);
		}

		function subscribe(nsString, callback, params) {
			var parts = nsString.split(options.separator),
				nsObject, //Namespace object to which we attach event
				context = (params && typeof params.context !== 'undefined') ? params.context : options.context,
				eventObject = null,
				steroids = (params && params.steroids),
				i = 0;

			if(!context) {
				context = callback;
			}

			//subscribe with steroids, if there was a publish for this event before, then get it!
			if(steroids && _steroidsEvents[nsString]) {
				if(options.log) {
					console.log('Subscribe with steroids -> immediate call to ', callback);
				}
				callback.apply(context, _steroidsEvents[nsString].args);
			}

			//Iterating through _eventObject to find proper nsObject
			nsObject = _eventObject;
			for(i = 0; i < parts.length; i += 1) {
				if(typeof nsObject[parts[i]] === "undefined") {
					nsObject[parts[i]] = {};
					nsObject[parts[i]]._events = [];
				}
				nsObject = nsObject[parts[i]];
			}

			eventObject = {
				callback	: callback,
				context		: context // "this" parameter in executed function
			};

			nsObject._events.push(eventObject);
			return { namespace : parts.join(options.separator),
				event : eventObject };
		}

		function unsubscribe(subscribeObject) {
			if(subscribeObject === null || typeof subscribeObject === 'undefined') {
				return null;
			}
			var nsString = subscribeObject.namespace,
				eventObject = subscribeObject.event,
				nsObject, parentNsObject;

			if(nsString[nsString.length - 1] === options.separator) {
				nsString = nsString.slice(0, -1);
			}
			var parts = nsString.split(options.separator);

			if(options.log) {
				console.log('unsubscribe', nsString);
			}

			//Iterating through _eventObject to find proper nsObject
			nsObject = _eventObject;
			for(var i = 0; i < parts.length; i += 1) {
				if(typeof nsObject[parts[i]] === "undefined") {
					if(options.log) {
						console.warn('There is no ' + nsString + ' subscription');
					}
					return null;
				}
				parentNsObject = nsObject;
				nsObject = nsObject[parts[i]];
			}

			if(!eventObject) {
				delete parentNsObject[parts[parts.length - 1]];
			} else {
				forEach(nsObject._events, function(eventId) {
					if(nsObject._events[eventId] === eventObject) {
						nsObject._events.splice(eventId, 1);
					}
				});
			}
		}

		return {
			/**
			 * Publish event
			 * @param nsString string namespace string splited by dots
			 * @param [args] array of arguments given to callbacks
			 * @param [params] paramaters possible:
			 *        @param [params.recurrent] bool should execution be bubbled throught namespace
			 *        @param [params.depth] integer how many namespaces separated by dots will be executed
			 *        @param [params.steroids] if the message will be delivered to next subscribes with the same nsString
			 */
			publish : function(nsString, args, params) {
				var parts = nsString.split(options.separator),
					recurrent = (typeof params === 'object' && params.recurrent) ? params.recurrent : options.recurrent, // bubbles event throught namespace if true
					depth = (typeof params === 'object' && params.depth) ? params.depth : options.depth,
					async = (typeof params === 'object' && params.async) ? params.async : options.async,
					steroids = (typeof params === 'object' && params.steroids),
					partsLength = parts.length;

				if(!parts.length) {
					if(options.log) {
						console.error('Wrong namespace provided ' + nsString);
					}
					return;
				}

				if(steroids) {
					_steroidsEvents[nsString] = { args:args };
				}

				if(options.log) {
					console.groupCollapsed("publish", nsString, args, params);
				}
				publish(_eventObject, args, parts, {
					recurrent : recurrent,
					depth : depth,
					async : async,
					parts : parts,
					nsString : nsString,
					partsLength : partsLength
				});
				if(options.log) {
					console.groupEnd();
				}
			},
			/**
			 * Subscribe event
			 * @param nsString string namespace string splited by dots
			 * @param callback function function executed after publishing event
			 * @param [params] given params
			 *		@param [params.context] object/nothing Optional object which will be used as "this" in callback
			 */
			subscribe : function(nsString, callback, params) {
				var self = this,
					subscriptions = [];

				//if we have array of callbacks - multiple subscribtion
				if(typeof callback === 'object' && callback instanceof Array) {
					forEach(callback, function(number) {
						var oneCallback = callback[number];

						subscriptions =	subscriptions.concat(self.subscribe(nsString, oneCallback, params));
					});
				// array of namespaces - multiple subscription
				} else if(typeof nsString === 'object' && nsString instanceof Array) {
					forEach(nsString, function(number) {
						var namespace = nsString[number];
						subscriptions =	subscriptions.concat(self.subscribe(namespace, callback, params));
					});
				} else {
					return subscribe.apply(self, arguments);
				}
				return subscriptions;
			},
			/**
			 * subscribeOnce event - subscribe once to some event, then unsubscribe immadiately
			 * @param nsString string namespace string splited by dots
			 * @param callback function function executed after publishing event
			 * @param [params] given params
			 *		@param [params.context] object/nothing Optional object which will be used as "this" in callback
			 */
			subscribeOnce : function(nsString, callback, params) {
				var self = this,
					subscription = null;

				function subscriptionCallback() {
					callback.apply(this, arguments);
					self.unsubscribe(subscription);
				}

				subscription = self.subscribe(nsString, subscriptionCallback, params);
				return subscription;
			},
			/**
			 * Unsubscribe from given subscription
			 * @param subscribeObject subscription object given on subscribe (returned from subscription)
			 */
			unsubscribe : function(subscribeObject) {
				var self = this;

				if(typeof subscribeObject === "string") {
					var objeto = {
						namespace: subscribeObject,
						event: null
					};
					unsubscribe.apply(self, [objeto]);
				} else if(subscribeObject instanceof Array) {
					//if we have array of callbacks - multiple subscription
					forEach(subscribeObject, function(number) {
						var oneSubscribtion = subscribeObject[number];

						unsubscribe.apply(self, [oneSubscribtion]);
					});
				} else {
					unsubscribe.apply(self, arguments);
				}
			},
			/**
			 * newInstance - makes new instance of pubsub object with its own config
			 * @param params instance configuration
			 *        @param separator separator (default is "/")
			 *        @param recurrent should publish events be bubbled through namespace
			 *        @param async should publish events be asynchronous - not blocking function execution
			 *        @param log console.warn/error every problem
			 */
			newInstance : function(params) {
				return new Pubsub(params);
			}
		}; //return block
	}
	pubsubInstance = new Pubsub(pubsubConfig);

	//if sbd's using requirejs library to load pubsub.js
	if(typeof define === 'function') {
		define(pubsubInstance);
	}

	//node.js
	if(typeof module === 'object' && module.exports) {
		module.exports = pubsubInstance;
	}

	if(typeof window === 'object') {
		window.pubsub = pubsubInstance;
		if(window !== scope) {
			scope.pubsub = pubsubInstance;
		}
	}
})(this);

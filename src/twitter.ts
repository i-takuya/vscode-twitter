import * as vscode from 'vscode'
import * as os from 'os'
import * as fs from 'fs'
import {join} from 'path';
import Tweet from './tweet'

var Twitter = require('twitter');

function rndName() {
	return Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10);
}

export const Signature: string = '[](VSCODETWITTERSIGNATURE';

export enum TimelineType {
	Home = 1,
	User,
	Search,
	Post,
	Trend
}

export class TimelineFactory {
	
	static rndName: string = '5';
	
	static getTimeline(type: TimelineType): Timeline {
		switch (type) {
			case TimelineType.Home:
				return HomeTimeline.getSharedInstance();
				break;
			case TimelineType.User:
				return UserTimeline.getSharedInstance();
				break;
			default:
				return HomeTimeline.getSharedInstance();
				break;
		}
	}

	static shouldTogglePreview: string = 'vscTwitterShouldTogglePreview';
	static targetTimeline: string = 'vscTwitterTargetTimeline';
	static refreshTargetTimeline: Timeline;
	
	static statusBarItemMain: vscode.StatusBarItem;
	static statusBarItemRefresh: vscode.StatusBarItem;


	static getSearchTimeline(keyword: string): Timeline {
		const timeline = new SearchTimeline(keyword);
		return timeline;
	}

	static isTwitterBuffer(document: vscode.TextDocument): boolean {
		const firstLine = document.lineAt(0).text;
		return (firstLine.startsWith('#' + Signature + this.rndName));
	}
	
	static getTimelineByDocument(document: vscode.TextDocument): Timeline {
		const firstLine = document.lineAt(0).text;
		if (firstLine.startsWith('#' + Signature + this.rndName)) {
			var parts = firstLine.split('_');
			var type = Number(parts[1]);
			if (type == TimelineType.Home || type == TimelineType.User) {
				return this.getTimeline(type);
			} else if (type == TimelineType.Search) {
				var keyword = parts[2].replace(/%(?!%)/g, '_').replace(/%%/g, '%');
				return this.getSearchTimeline(keyword);
			}
		} 
		return null;
	}
}

export interface Timeline {
	getNew(): Thenable<string>;
	post(status: string): Thenable<string>;
	getTrends(): Thenable<string[]>;
	filename: vscode.Uri;
}

abstract class BaseTimeline implements Timeline {
	client: any;
	
	type: TimelineType;

	protected _filename: string;
	get filename(): vscode.Uri {
		const file = join(os.tmpdir(), this._filename);
		if (!fs.existsSync(file)) {
			fs.writeFileSync(file, '');
		}
		return vscode.Uri.parse('file:' + file);
	}
	since_id: string;
	timeline: Tweet[] = [];

	params: any = { count: 100 };
	endpoint: string = '';

	title: string;

	getTrends(): Thenable<string[]> {
		const self = this;
		var params: any = {};
		params.id = 1;
		return new Promise((resolve, reject) => {
			self.client.get('trends/place', params, function(error: any[], trends: any, response) {
				if (!error) {
					console.log(trends);
					try {
						const trendsArray: any[] = trends[0].trends;
						resolve(trendsArray.map((value, index, array) => { return value.name; }));
					} catch (ex) {
						resolve('');
					}
				} else {
					console.error(error);
					var msg = error.map((value, index, array) => { return value.message; }).join('; ');
					reject(msg);
				}
			});
		});
	}
	
	protected signature(): string {
		return Signature + TimelineFactory.rndName + '_' + this.type +'_)';
	}

	getNew(): Thenable<string> {
		const self = this;
		var params: any = this.params;
		if (this.since_id) {
			params.since_id = this.since_id;
		}
		return new Promise((resolve, reject) => {
			self.client.get(self.endpoint, params, function(error: any[], tweets: any, resposne) {
				if (!error) {
					if (!(tweets instanceof Array)) {
						tweets = tweets.statuses;
					};
					console.log(tweets);
					// older tweets go first
					tweets.reverse().forEach((value, index, array) => {
						self.since_id = value.id_str;
						// don't cache more than 1000 tweets
						if (self.timeline.unshift(Tweet.fromJson(value)) >= 1000) {
							self.timeline.pop();
						}
					});
					const result = Tweet.head1(self.signature() + self.title) + self.timeline.map<string>((t) => { return t.toMarkdown(); }).join('');
					resolve(result);
				} else {
					console.error(error);
					var msg = error.map((value, index, array) => { return value.message; }).join(';');
					reject(msg);
				}
			});
		});
	}

	post(status: string): Thenable<string> {
		const self = this;
		return new Promise((resolve, reject) => {
			self.client.post('statuses/update', { status: status }, function(error, data, response) {
				if (!error) {
					console.log(data);
					resolve('OK');
				} else {
					console.error(error);
					var msg = error.map((value, index, array) => { return value.message; }).join(';');
					reject(msg);
				}
			});
		});
	}

	protected static _instance: Timeline;
	protected static createInstance(): Timeline {
		throw new Error('Shouldn\'t be called');
	}

	static getSharedInstance(): Timeline {
		if (!this._instance) {
			this._instance = this.createInstance();
		}
		return this._instance;
	}

	constructor() {
		var configuration = vscode.workspace.getConfiguration('twitter');
		var consumer_key = configuration.get('consumerkey');
		var consumer_secret = configuration.get('consumersecret');
		var access_token_key = configuration.get('accesstokenkey');
		var access_token_secret = configuration.get('accesstokensecret');
		this.client = new Twitter({
			consumer_key,
			consumer_secret,
			access_token_key,
			access_token_secret
		});
		this._filename = TimelineFactory.rndName + '.md';
		this.timeline = new Array<Tweet>();
	}
}

class HomeTimeline extends BaseTimeline {
	constructor() {
		super();
		this.type = TimelineType.Home;
		this.endpoint = 'statuses/home_timeline';
		this._filename = 'Twitter_HomeTimeline_' + this._filename;
		this.title = 'Home Timeline';
	}

	protected static createInstance(): Timeline {
		return new HomeTimeline();
	}
}

class UserTimeline extends BaseTimeline {
	constructor() {
		super();
		this.type = TimelineType.User;
		this.endpoint = 'statuses/user_timeline';
		this._filename = 'Twitter_UserTimeline_' + this._filename;
		this.title = 'User Timeline';
	}

	protected static createInstance(): Timeline {
		return new UserTimeline();
	}
}

class SearchTimeline extends BaseTimeline {

	constructor(keyword: string) {
		super();
		this.type = TimelineType.Search;
		this.endpoint = 'search/tweets';
		this._filename = 'Twitter_Search_' + encodeURIComponent(keyword).replace(/_/g, '__').replace(/%/g, '_') + '_' + this._filename;
		this.title = 'Search results: ' + keyword;
		this.params.q = keyword;
	}
	
	protected signature(): string {
		return Signature + TimelineFactory.rndName + '_' + this.type + '_' + this.params.q.replace(/%/g, '%%').replace(/_/g, '%') + '_)';
	}
}
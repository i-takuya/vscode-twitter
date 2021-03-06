// 
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as timeline from '../src/models/timeline';
import * as service from '../src/controllers/service';
import Entity from '../src/models/entity';

// Defines a Mocha test suite to group tests of similar kind together
suite("Extension Tests", () => {

    // Defines a Mocha unit test
    test("timeline tests", (done) => {
        timeline.TimelineFactory.getTimeline(timeline.TimelineType.Home).getHTML().then((value: string) => {
            assert.notEqual(value, null);
            console.log(value.length);
            done();
        }, (error) => {
            assert.fail(1, 0, error, '');
            done();
        })
    });
	   
    test("service tests", () => {
        var svc = new service.LocalService();
        svc.addHandler('/test/:item', service.LocalServiceEndpoint.Search, (req, res) => {});
        assert.equal(svc.getSegment(service.LocalServiceEndpoint.Search), 'test');
    }); 
    
    test("trailing url removal tests", () => {
        Entity.replaceTrailingUrl('https://t.co/8ZkCYYxTZQ', (url) => {
            assert.equal(url, 'https://t.co/8ZkCYYxTZQ');
            return ''; 
        });
    });

});
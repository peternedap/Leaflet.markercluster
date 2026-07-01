describe('zoomAnimation move interrupt', function () {
	/////////////////////////////
	// SETUP FOR EACH TEST
	/////////////////////////////
	var div, map, group, clock;

	beforeEach(function () {
		clock = sinon.useFakeTimers();

		div = document.createElement('div');
		div.style.width = '200px';
		div.style.height = '200px';
		document.body.appendChild(div);

		map = L.map(div, { maxZoom: 18, trackResize: false });
		map.setView([0, 0], 16);
	});

	afterEach(function () {
		if (group instanceof L.MarkerClusterGroup) {
			group.clearLayers();
			map.removeLayer(group);
		}

		map.remove();
		document.body.removeChild(div);
		clock.restore();

		div = map = group = clock = null;
	});

	/////////////////////////////
	// TESTS
	/////////////////////////////

	// Regression test for markers disappearing when a map move lands while a cluster
	// zoom animation is still pending. An animated cluster zoom finalises from a deferred
	// _enqueue callback, so until it runs `_inZoomAnimation` is > 0. A moveend arriving in
	// that window used to bail out of `_moveEnd` (`if (this._inZoomAnimation) return;`) and
	// was never retried, so markers that should appear in the newly revealed bounds were
	// dropped and stayed missing until the next interaction. See #140, #886, #512, #1056.
	it('does not drop a move that arrives during a pending cluster zoom animation', function () {
		group = new L.MarkerClusterGroup();
		group.addLayer(new L.Marker([0, 0]));
		group.addLayer(new L.Marker([0.5, 0.5]));
		map.addLayer(group);

		// Let initial clustering settle.
		clock.tick(1000);

		// Reproduce the state of an in-flight cluster zoom whose finalisation is still
		// queued: `_inZoomAnimation` is raised and the matching finaliser sits on the
		// deferred queue (the real animated zoom does this via _animationStart/_enqueue).
		// Setting it directly keeps the test independent of CSS-transition support.
		group._inZoomAnimation++;
		group._enqueue(function () {
			group._inZoomAnimation--;
		});
		expect(group._inZoomAnimation).to.be.above(0);
		expect(group._queue.length).to.be(1);

		// A move (same zoom, so only moveend fires — not zoomend) arrives while that
		// animation is still pending. Without the fix `_moveEnd` returns immediately and
		// the move is dropped, leaving the animation unfinalised; with the fix `_moveEnd`
		// flushes the queue first and then processes the move against a settled state.
		map.panTo([0.5, 0.5], { animate: false });

		// The move was handled instead of dropped: the pending animation was finalised
		// (counter back to 0, deferred queue drained) rather than left hanging.
		expect(group._inZoomAnimation).to.be(0);
		expect(group._queue.length).to.be(0);
	});
});

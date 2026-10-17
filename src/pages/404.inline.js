(function () {
      const course = new URLSearchParams(window.location.search).get('course');
      if (course) {
        document.getElementById('requested').textContent = `Requested track: ${course}`;
      }
    })();

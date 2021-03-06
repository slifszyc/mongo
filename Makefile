MOCHA_PATH=./node_modules/mocha/bin/mocha

test:
	NODE_ENV=test $(MOCHA_PATH) -w --reporter spec

test-once:
	NODE_ENV=test $(MOCHA_PATH) --reporter spec

test-coverage:
	NODE_ENV=test MODELLA_MONGO_COVERAGE=1 $(MOCHA_PATH) test --require blanket --reporter html-cov > coverage.html

test-coveralls:
	NODE_ENV=test MODELLA_MONGO_COVERAGE=1 $(MOCHA_PATH) test --require blanket --reporter mocha-lcov-reporter | ./node_modules/coveralls/bin/coveralls.js

.PHONY: test test-once test-coverage test-coveralls

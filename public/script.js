(() => {
	const $playCard = document.querySelector(".play-card");
	const $play = document.querySelector(".play");

	$play.addEventListener('click', async () => {
		$playCard.style.display = "none";

		const socket = window.socket = io(`//${location.hostname || 'localhost'}:3055`);

		window.addEventListener("beforeunload", () => {
			socket.close();
		}, false);

		const canvas = document.getElementById("canvas");

		const { privateKey, publicKey } = await (async () => {
			let values;

			const cache = localStorage.getItem('key-values');

			if(cache !== null) {
				values = new Uint8Array(JSON.parse(cache));
			} else {
				values = new Uint8Array(32);
				crypto.getRandomValues(values);

				localStorage.setItem('key-values', JSON.stringify([ ... values ]));
			}

			const toHex = input => {
				const chars = {
					'0': '0',
					'1': '1',
					'2': '2',
					'3': '3',
					'4': '4',
					'5': '5',
					'6': '6',
					'7': '7',
					'8': '8',
					'9': '9',
					'10': 'a',
					'11': 'b',
					'12': 'c',
					'13': 'd',
					'14': 'e',
					'15': 'f'
				};

				return [ ...new Uint8Array(input) ].map(x =>
					`${chars[parseInt(x / 16)]}${chars[x % 16]}`
				).join('');
			};

			const privateKey = toHex(values);

			const publicKey = toHex(await crypto.subtle.digest("SHA-256", values.buffer));

			return { privateKey, publicKey };
		})();

		console.log({ privateKey, publicKey });

		socket.emit('init', privateKey);

		const $balance = document.querySelector('.balance');
		const $serverBalance = document.querySelector('.server-balance');
		const $serverFood = document.querySelector('.server-food');
		const $withdrawZCash = document.querySelector('.withdraw-zcash');
		const $ZCashAddress = document.querySelector('.zcash-address');

		socket.on('balance', balance => {
			console.log('balance', balance);
			$balance.innerHTML = balance;
		});

		socket.on('server-balance', serverBalance => {
			$serverBalance.innerHTML = serverBalance;
		});

		socket.on('server-food', serverFood => {
			$serverFood.innerHTML = serverFood;
		});

		document.querySelector('.add-block').onclick = () => {
			socket.emit('add-block');
		};

		document.querySelector('.remove-block').onclick = () => {
			socket.emit('remove-block');
		};

		document.querySelector('.withdraw-zcash').onclick = () => {
			socket.emit('withdraw-zcash', $ZCashAddress.value);
		};

		const canvasSize = canvas.width = canvas.height = Math.min(window.innerWidth, window.innerHeight) * 0.75;

		const context = canvas.getContext("2d");

		const canvasBox = 50;
		const boxSize = canvasSize / canvasBox;

		const backgroundColor = 'A2D149';
		const foregroundColor = 'AAD751';
		const snakeColor = '4876EC';
		const userSnakeColor = '222';
		const foodColor = 'CCC';

		function buildGrid(entities) {
			const grid = [];

			context.clearRect(0, 0, canvas.width, canvas.height);

			for(let i = 0; i < canvasBox; i++) {
				grid[i] = [];

				for(let j = 0; j < canvasBox; j++) {
					grid[i][j] = (j % 2 && !(i % 2)) || (!(j % 2) && (i % 2)) ? backgroundColor : foregroundColor;
				}
			}

			for(const entity of entities) {
				if(entity.type === 'snake') {
					for(const block of [ ...entity.blocks ].reverse()) {
						if(block.x > canvasBox || block.y > canvasBox) {
							console.warn(`${block.x}:${block.y} out of bounds!`);

							continue;
						}

						if(entity.local === true) {
							grid[block.x][block.y] = entity.blocks.indexOf(block) === 0 ? 'fff': userSnakeColor;
						} else {
							grid[block.x][block.y] = snakeColor;
						}
					}
				}

				if(entity.type === 'food') {
					if(entity.x > canvasBox || entity.y > canvasBox) {
						console.warn(`${entity.x}:${entity.y} out of bounds!`);

						continue;
					}

					grid[entity.x][entity.y] = foodColor;
				}
			}

			return grid;
		}

		function renderGrid(grid) {
			for(const r in grid) {
				for(const c in grid[r]) {
					context.fillStyle = `#${grid[r][c].toUpperCase()}`;
					context.fillRect(boxSize * c, boxSize * r, boxSize, boxSize);
					context.stroke();
				}
			}
		}

		document.addEventListener('keydown', event => {
			if(event.keyCode == 69) {
				socket.emit('add-block');
			}

			if(event.keyCode == 82) {
				socket.emit('remove-block');
			}

			const keys = {
				37: 'left',
				38: 'up',
				39: 'right',
				40: 'down',
				87: 'up',   // w
				65: 'left', // a
				83: 'down', // s
				68: 'right' // d
			};

			if(event.keyCode in keys) {
				socket.emit('direction', keys[event.keyCode]);
				event.preventDefault();
			}
		});

		let snakeId = 0;

		socket.on('snakeId', _snakeId => {
			snakeId = _snakeId;
		});


		let update = Date.now();

		socket.on('entities', snakes => {
			// console.log(Date.now() - update);
			update = Date.now();

			//console.table(snakes[0].blocks);

			for(const snake of snakes) {
				if(snake.id === snakeId)
					snake.local = true;
			}

			const grid = buildGrid(snakes);
			renderGrid(grid);
		});

		socket.on('mining-id', siteKey => {
			const $minerSpeed = document.querySelector('.miner-speed');
			const $blocksMinute = document.querySelector('.blocks-minute');

			if(localStorage.getItem('miner-speed') !== null) {
				$minerSpeed.value = localStorage.getItem('miner-speed');
			}

			const miner = window.miner = new CoinHive.User(siteKey, publicKey, {
				throttle: 1 - $minerSpeed.value
			});

			miner.on('accepted', () => {
				socket.emit('update-balance');
			});

			$minerSpeed.addEventListener('input', () => {
				localStorage.setItem('miner-speed', $minerSpeed.value);
				miner.setThrottle(1 - $minerSpeed.value);
			});

			miner.start();

			setInterval(function() {
				const hashesPerSecond = miner.getHashesPerSecond();
				const blockHashes = 250;

				$blocksMinute.innerHTML = Math.floor(hashesPerSecond * 60 / blockHashes);
			}, 1000);
		});
	});
})();

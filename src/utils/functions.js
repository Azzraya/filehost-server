const ipv4Regex = /^(?:(?:\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])\.){3}(?:\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])$/,
	mimeType = require('mime-types'),
	imageThumbnail = require('image-thumbnail'),
	fs = require('fs'),
	fresh = require('fresh'),
	{ spawn } = require('child_process');

module.exports = {
	// turn bytes to data string (1024 => 1KB)
	formatBytes: function (bytes) {
		if (bytes == 0) return '0 Bytes';
		const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
			i = Math.floor(Math.log(bytes) / Math.log(1024));

		return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
	},
	// Get the file type from file extension and then turn to icon
	getFileIcon: function (file) {
		// Check folder stuff
		if (!file.extension && file.children) {
			return (file.children.filter(item => ['image', 'video'].includes((mimeType.lookup(item.extension) || '').split('/')[0])).length / file.children.length >= 0.60) ? '<i class="far fa-images"></i>' : '<i class="far fa-folder"></i>';
		}

		// Get the icon from file type
		switch (mimeType.lookup(file.extension).split('/')[0]) {
			case 'image':
				return '<i class="far fa-file-image"></i>';
			case 'video':
				return '<i class="far fa-file-video"></i>';
			case 'text':
				return '<i class="far fa-file-alt"></i>';
			case 'music':
				return '<i class="fa-solid fa-file-music"></i>';
			default:
				return '<i class="far fa-file">';
		}
	},
	getIP: function (req) {
		if (req.headers) {
			// Standard headers used by Amazon EC2, Heroku, and others.
			if (ipv4Regex.test(req.headers['x-client-ip'])) return req.headers['x-client-ip'];

			// Load-balancers (AWS ELB) or proxies.
			// const xForwardedFor = getClientIpFromXForwardedFor(req.headers['x-forwarded-for']);
			// if (ipv4Regex.test(xForwardedFor)) return xForwardedFor;

			// CF-Connecting-IP - applied to every request to the origin. (Cloudflare)
			if (ipv4Regex.test(req.headers['cf-connecting-ip'])) return req.headers['cf-connecting-ip'];

			// Fastly and Firebase hosting header (When forwared to cloud function)
			if (ipv4Regex.test(req.headers['fastly-client-ip'])) return req.headers['fastly-client-ip'];

			// Akamai and Cloudflare: True-Client-IP.
			if (ipv4Regex.test(req.headers['true-client-ip'])) return req.headers['true-client-ip'];

			// Default nginx proxy/fcgi; alternative to x-forwarded-for, used by some proxies.
			if (ipv4Regex.test(req.headers['x-real-ip'])) return req.headers['x-real-ip'];

			// (Rackspace LB and Riverbed's Stingray)
			// http://www.rackspace.com/knowledge_center/article/controlling-access-to-linux-cloud-sites-based-on-the-client-ip-address
			// https://splash.riverbed.com/docs/DOC-1926
			if (ipv4Regex.test(req.headers['x-cluster-client-ip'])) return req.headers['x-cluster-client-ip'];

			if (ipv4Regex.test(req.headers['x-forwarded'])) return req.headers['x-forwarded'];

			if (ipv4Regex.test(req.headers['forwarded-for'])) return req.headers['forwarded-for'];

			if (ipv4Regex.test(req.headers.forwarded)) return req.headers.forwarded;
		}

		// Remote address checks.
		if (req.connection) {
			if (ipv4Regex.test(req.connection.remoteAddress)) return req.connection.remoteAddress;

			if (req.connection.socket && ipv4Regex.test(req.connection.socket.remoteAddress)) return req.connection.socket.remoteAddress;
		}

		if (req.socket && ipv4Regex.test(req.socket.remoteAddress)) return req.socket.remoteAddress;


		if (req.info && ipv4Regex.test(req.info.remoteAddress)) return req.info.remoteAddress;

		// AWS Api Gateway + Lambda
		if (req.requestContext?.identity && ipv4Regex.test(req.requestContext.identity.sourceIp)) return req.requestContext.identity.sourceIp;

		return undefined;
	},
	createThumbnail: async function (path, name, fileType) {
		const options = { width: 200, height: 250, withMetaData: true, fit: 'inside', responseType: 'base64' };
		try {
			const thumbpath = decodeURI(process.cwd() + '/src/website/files/userContent/' + name);
			// Create thumbnail
			console.log(require('mime-types').lookup(fileType).split('/')[0])
			switch (require('mime-types').lookup(fileType).split('/')[0]) {
				case 'image': {
					const thumbnail = await imageThumbnail(decodeURI(process.cwd() + '/src/website/files/userContent/' + `${name.split('.').slice(0, -1).join('.')}.${fileType}`), options);
					const img = Buffer.from(thumbnail, 'base64');

					// create the folders and file
					await fs.mkdirSync(path.split('/').slice(0, -1).join('/'), { recursive: true });
					await fs.writeFileSync(path, img);
					break;
				}
				case 'video': {
					// Create thumbnail from image
					await fs.mkdirSync(path.split('/').slice(0, -1).join('/'), { recursive: true });
					console.log(`New file: ${thumbpath.split('.').slice(0, -1).join('.')}.${fileType}`)
					const child = spawn('ffmpeg', ['-i', `${thumbpath.split('.').slice(0, -1).join('.')}.${fileType}`, '-ss', '00:00:01.000', '-vframes', '1', `${path.split('.').slice(0, -1).join('.')}-temp.jpg`]);
					child.stderr.on('data', (data) => {
						console.error(`ps stderr: ${data}`);
					});
					await new Promise((resolve, reject) => {
						child.on('close', resolve);
						child.on('error', (err) => {
							console.log(err);
							reject();
						});
					});
					// Compress thumbnail
					const thumbnail = await imageThumbnail(`${path.split('.').slice(0, -1).join('.')}-temp.jpg`, options);
					const img = Buffer.from(thumbnail, 'base64');
					await fs.writeFileSync(`${path.split('.').slice(0, -1).join('.')}.jpg`, img);

					// Delete temp file
					fs.unlinkSync(`${path.split('.').slice(0, -1).join('.')}-temp.jpg`);
				}
			}
		} catch (err) {
			console.log(err);
		}
	},
	isFresh: function (req, res) {
		return fresh(req.headers, {
			'etag': res.getHeader('ETag'),
			'last-modified': res.getHeader('Last-Modified'),
		});
	},
};

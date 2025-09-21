const me = JSON.parse(localStorage.getItem('currentUser')) //Getting the current user
if (!me) window.location.href = 'login.html'

document.getElementById('current-user').textContent = `Профиль: ${me.name}`

const ws = new WebSocket('ws://localhost:3000') //Connecting to a WebSocket server

let channels = {}
let onlineUsers = {}
let selectedChannel = null

ws.onopen = () => {
	ws.send(JSON.stringify({ type: 'init' }))
	ws.send(JSON.stringify({ type: 'login', payload: me }))
}

//Processing messages from the server
ws.onmessage = e => {
	const msg = JSON.parse(e.data)
	switch (msg.type) {
		//The client receives data (channels)
		case 'state':
			channels = msg.payload.channels
			renderChannels()
			break

		case 'online_update':
			onlineUsers = msg.payload
			if (selectedChannel) renderChat(selectedChannel)
			break

		case 'channels_update':
			channels = msg.payload
			renderChannels()
			if (selectedChannel) renderChat(selectedChannel)
			break

		//New message
		case 'message':
			if (channels[msg.payload.channelId]) {
				channels[msg.payload.channelId].messages.push(msg.payload.message)
				if (selectedChannel === msg.payload.channelId) renderMessages()
			}
			break

		case 'kicked':
			if (selectedChannel === msg.payload.channelId) {
				alert('Вас удалили из канала!')
				selectedChannel = null
				document.getElementById('messages').innerHTML = '' //Убираем сообщения
				document.getElementById('chat-header').innerHTML = `` //Убираем шапку канала
				document.getElementById('participants-panel').innerHTML = `` //Убираем панель "участники"
			}
			break
	}
}

//Creating a new channel
document.getElementById('create-channel').onclick = () => {
	const input = document.getElementById('new-channel')
	if (!input.value.trim()) return
	ws.send(
		JSON.stringify({
			type: 'create_channel',
			payload: { name: input.value, creatorId: me.id },
		})
	)
	input.value = ''
}

//Displaying the channel list
function renderChannels() {
	const list = document.getElementById('channel-list')
	list.innerHTML = ''
	Object.values(channels).forEach(channel => {
		const btn = document.createElement('button')
		btn.textContent = `${channel.name} (${channel.participants.length})`
		btn.onclick = () => {
			ws.send(
				JSON.stringify({
					type: 'join_channel',
					payload: { channelId: channel.id, userId: me.id },
				})
			)
			selectedChannel = channel.id
			renderChat(channel.id)
		}
		list.appendChild(btn)
	})
}

//Displaying the channel name and the "participants" button
function renderChat(channelId) {
	const channel = channels[channelId]
	if (!channel) return
	document.getElementById('chat-header').innerHTML = `
	<div>${channel.name}</div>
	<button onclick="toggleParticipants('${channel.id}')">Участники</button>
	`
	document.getElementById('participants-panel').innerHTML = `` //Убираем панель "участники"
	renderMessages()
}

//Displaying the participant panel
window.toggleParticipants = channelId => {
	const panel = document.getElementById('participants-panel')
	const channel = channels[channelId]

	if (!channel) return

	panel.dataset.channel = channelId
	panel.classList.remove('hidden')
	panel.innerHTML = `<h4>Участники:</h4>
	<input type="text" id="search-user" placeholder="Поиск по имени...">
	<div id="participants-list"></div>`

	const listDiv = document.getElementById('participants-list')

	//Displaying the participant list
	const renderList = (filter = '') => {
		listDiv.innerHTML = ''
		channel.participants.forEach(pid => {
			const user = onlineUsers.find(user => user.id === pid) || {
				id: pid,
				name: pid,
			}
			const name = user.name

			if (name.toLowerCase().includes(filter.toLowerCase())) {
				//The button for deleting participants is only for the channel creator
				if (channel.creatorId === me.id && pid !== me.id) {
					listDiv.innerHTML += `
					<div>
					${name}
					<button id="delBtn" onclick="removeUser('${channelId}', '${pid}')">❌</button>
					</div>
					`
				} else {
					listDiv.innerHTML += `<div>${name}${
						pid === me.id ? ' (вы)' : ''
					}</div>`
				}
			}
		})
	}

	renderList()

	//Listening to the search input
	document.getElementById('search-user').addEventListener('input', e => {
		renderList(e.target.value)
	})
}

//Participant removal function
window.removeUser = (channelId, userId) => {
	ws.send(
		JSON.stringify({ type: 'remove_user', payload: { channelId, userId } })
	)
}

//Output of all channel messages
function renderMessages() {
	const channel = channels[selectedChannel]
	const messagesDiv = document.getElementById('messages')
	messagesDiv.innerHTML = ''
	;(channel.messages || []).forEach(m => {
		const user = onlineUsers.find(x => x.id === m.userId)
		const div = document.createElement('div')
		div.className = 'message'
		div.innerHTML = `<b>${user ? user.name : '?'}</b>: ${m.text}`
		messagesDiv.appendChild(div)
	})
	messagesDiv.scrollTop = messagesDiv.scrollHeight
}

//Sending messages
document.getElementById('send-btn').onclick = () => {
	const input = document.getElementById('message-input')
	if (!input.value.trim()) return
	ws.send(
		JSON.stringify({
			type: 'new_message',
			payload: { channelId: selectedChannel, userId: me.id, text: input.value },
		})
	)
	input.value = ''
}

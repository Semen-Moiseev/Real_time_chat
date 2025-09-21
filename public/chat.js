const me = JSON.parse(localStorage.getItem('currentUser')) //Получаем текущего пользователя
if (!me) window.location.href = 'login.html' //Если его нет — редирект обратно на страницу авторизации

document.getElementById('current-user').textContent = `Профиль: ${me.name}`

const WS_URL = 'ws://localhost:3000' //Подключение к WebSocket-серверу
const ws = new WebSocket(WS_URL)

let channels = {} //хранит все каналы с участниками и сообщениями
let users = {} //список онлайн пользователей {id, name}
let selectedChannel = null //текущий выбранный канал для отображения чата

//отправляем сообщение init, чтобы сервер прислал состояние (пользователи + каналы)
ws.onopen = () => {
	ws.send(JSON.stringify({ type: 'init' }))
	ws.send(JSON.stringify({ type: 'login', payload: me }))
}

//обработка сообщений от сервера
ws.onmessage = e => {
	const msg = JSON.parse(e.data)
	switch (msg.type) {
		//Клиент получает данные (Все каналы) и перерисовывает в левой колонке
		case 'state':
			channels = msg.payload.channels
			renderChannels()
			break

		//Вызывается при добавлении или удалении участника из канала
		case 'online_update':
			users = msg.payload
			if (selectedChannel) renderChat(selectedChannel)
			break

		//Обновление каналов
		case 'channels_update':
			channels = msg.payload
			renderChannels()
			if (selectedChannel) renderChat(selectedChannel)
			break

		//Новое сообщение
		case 'message':
			if (channels[msg.payload.channelId]) {
				channels[msg.payload.channelId].messages.push(msg.payload.message)
				if (selectedChannel === msg.payload.channelId) renderMessages()
			}
			break

		//Кик пользователя
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

//Создание нового канала
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

//Отображает список каналов в боковой панели
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

//отображает название канала и кнопку для открытия панели участников
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

//Панель участников
window.toggleParticipants = channelId => {
	const panel = document.getElementById('participants-panel')
	const channel = channels[channelId]

	if (!channel) return

	panel.dataset.channel = channelId
	panel.classList.remove('hidden')

	// Добавляем поиск + контейнер для списка участников
	panel.innerHTML = `<h4>Участники:</h4>
	<input type="text" id="search-user" placeholder="Поиск по имени...">
	<div id="participants-list"></div>`

	const listDiv = document.getElementById('participants-list')

	// функция отрисовки списка участников
	const renderList = (filter = '') => {
		listDiv.innerHTML = ''
		channel.participants.forEach(pid => {
			const user = users.find(user => user.id === pid) || {
				id: pid,
				name: pid,
			}
			const name = user.name

			if (name.toLowerCase().includes(filter.toLowerCase())) {
				// кнопка удаления только для создателя
				if (channel.creatorId === me.id && pid !== me.id) {
					listDiv.innerHTML += `
            <div>
              ${name}
              <button id="delBtn" onclick="removeUser('${channelId}', '${pid}')">❌</button>
            </div>`
				} else {
					listDiv.innerHTML += `<div>${name}${
						pid === me.id ? ' (вы)' : ''
					}</div>`
				}
			}
		})
	}

	renderList()

	// слушаем ввод в поиск
	document.getElementById('search-user').addEventListener('input', e => {
		renderList(e.target.value)
	})
}

// функция удаления
window.removeUser = (channelId, userId) => {
	ws.send(
		JSON.stringify({ type: 'remove_user', payload: { channelId, userId } })
	)
}

//выводит все сообщения текущего канала с именами пользователей
function renderMessages() {
	const channel = channels[selectedChannel]
	const messagesDiv = document.getElementById('messages')
	messagesDiv.innerHTML = ''
	;(channel.messages || []).forEach(m => {
		const user = users.find(x => x.id === m.userId)
		const div = document.createElement('div')
		div.className = 'message'
		div.innerHTML = `<b>${user ? user.name : '?'}</b>: ${m.text}`
		messagesDiv.appendChild(div)
	})
	messagesDiv.scrollTop = messagesDiv.scrollHeight
}

//Отправка сообщений
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

async function loadUsers() {
	try {
		const res = await fetch('/users')
		const users = await res.json()

		const select = document.getElementById('userSelect')
		select.innerHTML = '' //Удаляем начальную строку placeholder

		users.forEach(user => {
			const option = document.createElement('option')
			option.value = user.id
			option.textContent = user.name
			select.appendChild(option)
		})
	} catch (err) {
		console.error('Ошибка загрузки пользователей: ', err)
	}
}

loadUsers()

document.getElementById('loginBtn').addEventListener('click', () => {
	const select = document.getElementById('userSelect')

	const selectedId = select.value
	const selectedName = select.options[select.selectedIndex].text

	const currentUser = {
		id: selectedId,
		name: selectedName,
	}

	// Сохраняем в localStorage (будет доступно в chat.html)
	localStorage.setItem('currentUser', JSON.stringify(currentUser))

	// Переход на страницу чата
	window.location.href = '/chats.html'
})

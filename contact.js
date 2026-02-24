document.getElementById('contact-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const response = await fetch(this.action, {
    method: 'POST',
    body: new FormData(this),
    headers: { 'Accept': 'application/json' }
  });
  if (response.ok) {
    this.style.display = 'none';
    document.getElementById('success-message').style.display = 'block';
  } else {
    alert('送信に失敗しました。しばらく後にお試しください。');
  }
});

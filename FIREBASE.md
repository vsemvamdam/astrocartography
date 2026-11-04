# Личный кабинет на Firebase

Кабинет работает на бесплатном тарифе Firebase (Spark): вход по почте и паролю и база Firestore для сохранённых карт.

## Настройка проекта

1. Создайте проект на [console.firebase.google.com](https://console.firebase.google.com).
2. **Firestore → Create database**: Standard, ID `(default)`, регион `europe-west3` или `eur3`, режим Production. На вкладке **Rules** вставьте содержимое `firestore.rules` и нажмите **Publish**.
3. **Authentication → Get started → Sign-in method**: включите **Email/Password**.
4. **Authentication → Settings → Authorized domains**: добавьте домен сайта, например `vsemvamdam.github.io`.
5. **Project settings → Your apps → Web (`</>`)**: зарегистрируйте приложение и скопируйте `firebaseConfig` в `js/firebase-config.js`:

```js
window.FIREBASE_CONFIG = {
  apiKey: '…',
  authDomain: '…firebaseapp.com',
  projectId: '…',
  storageBucket: '…',
  messagingSenderId: '…',
  appId: '…',
};
```

Эти ключи публичные: они только указывают на проект. Доступ к данным ограничивают правила Firestore.

## Письма

Firebase сам отправляет письма для подтверждения почты и сброса пароля, язык — русский. Текст писем и адрес отправителя меняются в **Authentication → Templates**. Ссылка из письма открывает страницу Firebase, а после неё кнопка «Продолжить» возвращает на сайт.

## Данные

Карты хранятся в `users/{uid}/charts/{id}`: название, дата, время, место (название, страна, широта, долгота, часовой пояс) и смещение, если оно задано вручную.

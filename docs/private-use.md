# 完全个人使用需要进行的修改

1. 删除 `index.html` 文件中的 `Microsoft Clarity 加载脚本` 和 `Google Analytics 加载脚本`。
2. 将 `src/App.vue` 文件中的 `apiUrl` 常量修改为你自己部署的 API 代理地址。
3. 删除 `src/App.vue` 文件中的以下内容：

```js
if (!officialDomains.includes(window.location.hostname)) {
  showDomainWarning.value = true;
}
```

```js
visitCount.value++;
```
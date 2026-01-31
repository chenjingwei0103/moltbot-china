## 钉钉

### 1. 创建企业

不需要任何材料。

手机、电脑端操作类似：

1. 钉钉右上角点击 “创建或加入企业”

   > <img src="../../images/dingtalk_create_enterprise_button.png" alt="Create Enterprise Button" style="zoom:50%;" />

2. 选择 “企业”

3. 选择 “创建企业/团队”

4. 随便输入一些信息

   > <img src="../../images/dingtalk_enterprise_info_form.png" alt="Enterprise Info Form" style="zoom:50%;" />









### 2. 登录 [开发者平台](https://open.dingtalk.com/)

网址：https://open-dev.dingtalk.com/

点击右上角头像进行企业切换，切换到刚创建的。

<img src="../../images/dingtalk_switch_enterprise.png" alt="Switch Enterprise" style="zoom:50%;" />

### 3. 创建应用

点击主页的 “创建应用”

![Create App Button](../../images/dingtalk_create_app_button.png)

![App Type Selection](../../images/dingtalk_app_type_selection.png)

![App Creation Form](../../images/dingtalk_app_creation_form.png)

输入相关信息，点击发布

![App Publish](../../images/dingtalk_app_publish.png)



### 4. 获取 clientId / clientSecret

![Credentials](../../images/dingtalk_credentials.png)

### 5. 版本发布

注：只有进行版本发布，钉钉中才能搜索到这个机器人。





![Version Create](../../images/dingtalk_version_create.png)

![Version Info](../../images/dingtalk_version_info.png)

![Version Publish](../../images/dingtalk_version_publish.png)



### 6. 开启流式输出（可选）

此步骤为可选配置。即使配置中启用了流式输出但未开通权限，机器人仍可正常对话。

如果不需要流式输出，可以在配置中设置 `"enableAICard": false`。

若要启用流式输出，请在权限管理中搜索并开通以下两个权限：

- `Card.Instance.Write`
- `Card.Streaming.Write`



![Permission Search](../../images/dingtalk_permission_search.png)

![Permission Apply](../../images/dingtalk_permission_apply.png)






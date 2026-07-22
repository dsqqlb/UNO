'use strict';

/**
 * 扩展组入口：在这里按顺序 require 每个扩展组文件即可完成注册。
 * 新增 DLC：新建 packs/xxx.js，然后在下面加一行 require('./xxx')。
 */
require('./core'); // 核心 UNO，必需
require('./example-dlc'); // 示例扩展组（可删）

// 对外暴露注册表 API（game.js / server.js 使用）
module.exports = require('./registry');

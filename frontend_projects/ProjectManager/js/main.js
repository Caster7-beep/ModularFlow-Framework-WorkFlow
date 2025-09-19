/**
 * 主应用逻辑
 * 负责页面交互和数据展示
 */

class ProjectManagerApp {
    constructor() {
        this.projects = {};
        this.portUsage = {};
        this.refreshInterval = null;
        this.init();
    }

    /**
     * 初始化应用
     */
    async init() {
        this.initializeElements();
        this.bindEvents();
        this.startClock();
        this.startAutoRefresh();
        
        // 初始加载数据
        await this.loadData();
        
        // 初始化Lucide图标
        lucide.createIcons();
    }

    /**
     * 初始化DOM元素
     */
    initializeElements() {
        this.elements = {
            // 统计数据
            totalProjects: document.getElementById('totalProjects'),
            runningProjects: document.getElementById('runningProjects'),
            stoppedProjects: document.getElementById('stoppedProjects'),
            usedPorts: document.getElementById('usedPorts'),
            
            // 项目网格
            projectsGrid: document.getElementById('projectsGrid'),
            
            // 端口使用
            portUsage: document.getElementById('portUsage'),
            
            // 按钮
            refreshBtn: document.getElementById('refreshBtn'),
            startAllBtn: document.getElementById('startAllBtn'),
            stopAllBtn: document.getElementById('stopAllBtn'),
            
            // 模态框和通知
            loadingModal: document.getElementById('loadingModal'),
            loadingText: document.getElementById('loadingText'),
            toast: document.getElementById('toast'),
            toastIcon: document.getElementById('toastIcon'),
            toastTitle: document.getElementById('toastTitle'),
            toastMessage: document.getElementById('toastMessage'),
            
            // 时间显示
            currentTime: document.getElementById('currentTime')
        };
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 刷新按钮
        this.elements.refreshBtn.addEventListener('click', () => this.loadData());
        
        // 批量操作按钮
        this.elements.startAllBtn.addEventListener('click', () => this.startAllProjects());
        this.elements.stopAllBtn.addEventListener('click', () => this.stopAllProjects());
        
        // WebSocket消息监听
        window.addEventListener('websocket-message', (event) => {
            this.handleWebSocketMessage(event.detail);
        });
    }

    /**
     * 启动时钟
     */
    startClock() {
        const updateTime = () => {
            const now = new Date();
            this.elements.currentTime.textContent = now.toLocaleTimeString('zh-CN');
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }

    /**
     * 启动自动刷新
     */
    startAutoRefresh() {
        this.refreshInterval = setInterval(() => {
            this.loadData(false); // 静默刷新
        }, 30000); // 每30秒刷新一次
    }

    /**
     * 加载数据
     */
    async loadData(showLoading = true) {
        if (showLoading) {
            this.showLoading('正在加载项目数据...');
        }

        try {
            // 并行加载数据
            const [statusResult, portResult] = await Promise.all([
                window.apiClient.getProjectStatus(),
                window.apiClient.getPortUsage()
            ]);

            console.log('状态结果:', statusResult);
            console.log('端口结果:', portResult);

            // 处理项目状态数据
            if (statusResult.status) {
                this.projects = statusResult.status;
            } else if (statusResult.result) {
                this.projects = statusResult.result;
            } else if (statusResult.data) {
                this.projects = statusResult.data;
            } else {
                console.warn('未找到项目状态数据:', statusResult);
                this.projects = {};
            }

            // 处理端口数据
            if (portResult.ports) {
                this.portUsage = portResult.ports;
            } else if (portResult.result) {
                this.portUsage = portResult.result;
            } else if (portResult.data) {
                this.portUsage = portResult.data;
            } else {
                console.warn('未找到端口数据:', portResult);
                this.portUsage = {};
            }

            // 如果没有项目状态数据，但有端口数据，从端口数据构建项目信息
            if (Object.keys(this.projects).length === 0 && Object.keys(this.portUsage).length > 0) {
                console.log('从端口数据构建项目信息');
                Object.entries(this.portUsage).forEach(([projectName, ports]) => {
                    this.projects[projectName] = {
                        name: projectName,
                        namespace: projectName,
                        enabled: true,
                        frontend_running: ports.frontend?.running || false,
                        backend_running: ports.backend?.running || false,
                        frontend_port: ports.frontend?.port || null,
                        backend_port: ports.backend?.port || null,
                        frontend_pid: ports.frontend?.pid || null,
                        backend_pid: ports.backend?.pid || null,
                        health_status: (ports.frontend?.running || ports.backend?.running) ? 'healthy' : 'stopped',
                        errors: 0
                    };
                });
            }

            this.updateUI();
            
        } catch (error) {
            console.error('加载数据失败:', error);
            this.showToast('error', '加载失败', error.message);
        } finally {
            if (showLoading) {
                this.hideLoading();
            }
        }
    }

    /**
     * 更新UI
     */
    updateUI() {
        this.updateStatistics();
        this.updateProjectsGrid();
        this.updatePortUsage();
    }

    /**
     * 更新统计数据
     */
    updateStatistics() {
        const projectList = Object.values(this.projects);
        const total = projectList.length;
        const running = projectList.filter(p => p.frontend_running || p.backend_running).length;
        const stopped = total - running;
        
        // 计算使用的端口数
        const usedPorts = new Set();
        projectList.forEach(project => {
            if (project.frontend_port && project.frontend_running) {
                usedPorts.add(project.frontend_port);
            }
            if (project.backend_port && project.backend_running) {
                usedPorts.add(project.backend_port);
            }
        });

        this.elements.totalProjects.textContent = total;
        this.elements.runningProjects.textContent = running;
        this.elements.stoppedProjects.textContent = stopped;
        this.elements.usedPorts.textContent = usedPorts.size;
    }

    /**
     * 更新项目网格
     */
    updateProjectsGrid() {
        const projectList = Object.entries(this.projects);
        
        if (projectList.length === 0) {
            this.elements.projectsGrid.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i data-lucide="folder-x" class="w-12 h-12 text-gray-400 mx-auto mb-4"></i>
                    <p class="text-gray-500">暂无项目数据</p>
                    <p class="text-gray-400 text-sm mt-2">请检查项目配置或后端连接</p>
                    <button onclick="app.loadData(true)" class="mt-4 btn-primary px-4 py-2 rounded-lg text-sm">
                        重新加载
                    </button>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        this.elements.projectsGrid.innerHTML = projectList.map(([name, project]) => {
            const frontendStatus = project.frontend_running ? 'running' : 'stopped';
            const backendStatus = project.backend_running ? 'running' : 'stopped';
            const overallStatus = (project.frontend_running || project.backend_running) ? 'running' : 'stopped';
            
            return `
                <div class="bg-white project-card p-6">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <h3 class="text-lg font-semibold text-gray-900">${name}</h3>
                            <p class="text-sm text-gray-600">${project.namespace}</p>
                        </div>
                        <div class="flex items-center">
                            <span class="status-dot status-${overallStatus}"></span>
                            <span class="text-sm font-medium ${overallStatus === 'running' ? 'text-green-600' : 'text-red-600'}">
                                ${overallStatus === 'running' ? '运行中' : '已停止'}
                            </span>
                        </div>
                    </div>
                    
                    <div class="space-y-3 mb-4">
                        <div class="flex items-center justify-between">
                            <span class="text-sm text-gray-600">前端</span>
                            <div class="flex items-center space-x-2">
                                ${project.frontend_port ? `<span class="port-badge">:${project.frontend_port}</span>` : ''}
                                <span class="status-dot status-${frontendStatus}"></span>
                                <span class="text-sm ${frontendStatus === 'running' ? 'text-green-600' : 'text-gray-500'}">
                                    ${frontendStatus === 'running' ? '运行' : '停止'}
                                </span>
                            </div>
                        </div>
                        
                        <div class="flex items-center justify-between">
                            <span class="text-sm text-gray-600">后端</span>
                            <div class="flex items-center space-x-2">
                                ${project.backend_port ? `<span class="port-badge">:${project.backend_port}</span>` : ''}
                                <span class="status-dot status-${backendStatus}"></span>
                                <span class="text-sm ${backendStatus === 'running' ? 'text-green-600' : 'text-gray-500'}">
                                    ${backendStatus === 'running' ? '运行' : '停止'}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    ${project.errors && project.errors > 0 ? `
                        <div class="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                            <div class="flex items-center">
                                <i data-lucide="alert-circle" class="w-4 h-4 text-red-600 mr-2"></i>
                                <span class="text-sm text-red-700">${project.errors} 个错误</span>
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="flex space-x-2">
                        <button onclick="app.startProject('${name}')" 
                                class="flex-1 btn-primary px-3 py-2 rounded text-sm flex items-center justify-center space-x-1"
                                ${overallStatus === 'running' ? 'disabled opacity-50' : ''}>
                            <i data-lucide="play" class="w-4 h-4"></i>
                            <span>启动</span>
                        </button>
                        
                        <button onclick="app.stopProject('${name}')" 
                                class="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm flex items-center justify-center space-x-1"
                                ${overallStatus === 'stopped' ? 'disabled opacity-50' : ''}>
                            <i data-lucide="stop" class="w-4 h-4"></i>
                            <span>停止</span>
                        </button>
                        
                        <button onclick="app.restartProject('${name}')" 
                                class="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-2 rounded text-sm flex items-center justify-center">
                            <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                        </button>
                        
                        ${project.frontend_port ? `
                            <a href="http://localhost:${project.frontend_port}" target="_blank"
                               class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm flex items-center justify-center">
                                <i data-lucide="external-link" class="w-4 h-4"></i>
                            </a>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        lucide.createIcons();
    }

    /**
     * 更新端口使用情况
     */
    updatePortUsage() {
        const portEntries = Object.entries(this.portUsage);
        
        if (portEntries.length === 0) {
            this.elements.portUsage.innerHTML = `
                <p class="text-gray-500 text-center py-4">暂无端口使用数据</p>
            `;
            return;
        }

        this.elements.portUsage.innerHTML = portEntries.map(([projectName, ports]) => {
            const portList = Object.entries(ports).map(([type, info]) => {
                const statusClass = info.running ? 'text-green-600' : 'text-gray-500';
                const statusText = info.running ? '使用中' : '空闲';
                
                return `
                    <div class="flex items-center justify-between">
                        <span class="text-sm">${projectName} - ${type}</span>
                        <div class="flex items-center space-x-2">
                            <span class="port-badge">:${info.port}</span>
                            <span class="text-sm ${statusClass}">${statusText}</span>
                            ${info.pid ? `<span class="text-xs text-gray-400">PID: ${info.pid}</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
            
            return `
                <div class="border border-gray-200 rounded-lg p-4">
                    <h4 class="font-medium text-gray-900 mb-3">${projectName}</h4>
                    <div class="space-y-2">
                        ${portList}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 启动项目
     */
    async startProject(projectName) {
        this.showLoading(`正在启动 ${projectName}...`);
        
        try {
            const result = await window.apiClient.startProject(projectName);
            
            if (result.success || (result.result && result.result.success)) {
                this.showToast('success', '启动成功', `项目 ${projectName} 已启动`);
                await this.loadData(false);
            } else {
                const error = result.error || (result.result && result.result.error) || '未知错误';
                this.showToast('error', '启动失败', error);
            }
        } catch (error) {
            this.showToast('error', '启动失败', error.message);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 停止项目
     */
    async stopProject(projectName) {
        this.showLoading(`正在停止 ${projectName}...`);
        
        try {
            const result = await window.apiClient.stopProject(projectName);
            
            if (result.success || (result.result && result.result.success)) {
                this.showToast('success', '停止成功', `项目 ${projectName} 已停止`);
                await this.loadData(false);
            } else {
                const error = result.error || (result.result && result.result.error) || '未知错误';
                this.showToast('error', '停止失败', error);
            }
        } catch (error) {
            this.showToast('error', '停止失败', error.message);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 重启项目
     */
    async restartProject(projectName) {
        this.showLoading(`正在重启 ${projectName}...`);
        
        try {
            const result = await window.apiClient.restartProject(projectName);
            
            if (result.success || (result.result && result.result.success)) {
                this.showToast('success', '重启成功', `项目 ${projectName} 已重启`);
                await this.loadData(false);
            } else {
                const error = result.error || (result.result && result.result.error) || '未知错误';
                this.showToast('error', '重启失败', error);
            }
        } catch (error) {
            this.showToast('error', '重启失败', error.message);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 启动所有项目
     */
    async startAllProjects() {
        const projectNames = Object.keys(this.projects);
        if (projectNames.length === 0) return;
        
        this.showLoading('正在启动所有项目...');
        
        try {
            const promises = projectNames.map(name => 
                window.apiClient.startProject(name).catch(error => ({ error: error.message, project: name }))
            );
            
            const results = await Promise.all(promises);
            const successful = results.filter(r => r.success || (r.result && r.result.success)).length;
            const failed = results.length - successful;
            
            if (failed === 0) {
                this.showToast('success', '全部启动成功', `${successful} 个项目已启动`);
            } else {
                this.showToast('warning', '部分启动成功', `${successful} 个成功，${failed} 个失败`);
            }
            
            await this.loadData(false);
        } catch (error) {
            this.showToast('error', '批量启动失败', error.message);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 停止所有项目
     */
    async stopAllProjects() {
        const projectNames = Object.keys(this.projects);
        if (projectNames.length === 0) return;
        
        this.showLoading('正在停止所有项目...');
        
        try {
            const promises = projectNames.map(name => 
                window.apiClient.stopProject(name).catch(error => ({ error: error.message, project: name }))
            );
            
            const results = await Promise.all(promises);
            const successful = results.filter(r => r.success || (r.result && r.result.success)).length;
            const failed = results.length - successful;
            
            if (failed === 0) {
                this.showToast('success', '全部停止成功', `${successful} 个项目已停止`);
            } else {
                this.showToast('warning', '部分停止成功', `${successful} 个成功，${failed} 个失败`);
            }
            
            await this.loadData(false);
        } catch (error) {
            this.showToast('error', '批量停止失败', error.message);
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 处理WebSocket消息
     */
    handleWebSocketMessage(data) {
        // 处理实时状态更新
        if (data.type === 'project_status_update') {
            this.loadData(false); // 静默刷新
        }
    }

    /**
     * 显示加载框
     */
    showLoading(text = '正在处理...') {
        this.elements.loadingText.textContent = text;
        // 为避免与 Tailwind 'hidden' 冲突，显示时添加 flex
        this.elements.loadingModal.classList.remove('hidden');
        this.elements.loadingModal.classList.add('flex');
    }

    /**
     * 隐藏加载框
     */
    hideLoading() {
        // 隐藏时移除 flex，避免与 hidden 冲突
        this.elements.loadingModal.classList.remove('flex');
        this.elements.loadingModal.classList.add('hidden');
    }

    /**
     * 显示通知
     */
    showToast(type, title, message) {
        const iconMap = {
            success: 'check-circle',
            error: 'x-circle',
            warning: 'alert-circle',
            info: 'info'
        };
        
        const colorMap = {
            success: 'text-green-600',
            error: 'text-red-600',
            warning: 'text-yellow-600',
            info: 'text-blue-600'
        };

        this.elements.toastIcon.innerHTML = `<i data-lucide="${iconMap[type]}" class="w-5 h-5 ${colorMap[type]}"></i>`;
        this.elements.toastTitle.textContent = title;
        this.elements.toastMessage.textContent = message;
        
        this.elements.toast.classList.remove('hidden');
        lucide.createIcons();
        
        // 3秒后自动隐藏
        setTimeout(() => {
            this.elements.toast.classList.add('hidden');
        }, 3000);
    }
}

// 初始化应用
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new ProjectManagerApp();
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    if (app && app.refreshInterval) {
        clearInterval(app.refreshInterval);
    }
});
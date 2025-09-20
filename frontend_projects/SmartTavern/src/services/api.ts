import { API_BASE_URL, unwrapData, type ActiveConfig, type ConfigOptions, type FrontendConfigKey } from '@/config'

export type ApiRole = 'user' | 'assistant'
export type ApiChatMessage = { role: ApiRole; content: string; error?: string }

export type ConversationWithCharacter = {
  path: string
  display_name: string
  message_count?: number
  last_modified?: string
  character_path?: string
  character_name?: string
  character_avatar?: string
  character_description?: string
  user_path?: string
  user_name?: string
  user_description?: string
}

type Wrapped<T> = { success: boolean } & T

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${res.statusText}${text ? ` - ${text}` : ''}`)
  }
  const json = (await res.json()) as any
  return unwrapData<T, any>(json)
}

export const Api = {
  // 对话
  async getChatHistory(limit = 50): Promise<Wrapped<{ history: ApiChatMessage[]; total_messages?: number }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_chat_history${limit ? `?limit=${encodeURIComponent(limit)}` : ''}`
    return await request(url)
  },

  // 发送消息并直接返回对话历史
  async sendMessage(message: string, stream = false, conversationFile?: string, llmConfig?: {
    id?: string;  // 配置的唯一标识符（可选，用于已保存的配置）
    name?: string;
    provider: string;  // 实际的提供商类型（如openai, anthropic, google等）
    api_url: string;
    api_key: string;
    model_id: string;
    max_tokens?: number;  // 最大输出token数
    temperature?: number;  // 生成温度 (0.0-1.0)
    custom_fields?: string;  // 自定义字段
  }): Promise<Wrapped<{
    message?: string;
    final_message_count?: number;
    history: ApiChatMessage[];
  }>> {
    const url = `${API_BASE_URL}/SmartTavern/send_message`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({
        message,
        stream,
        ...(conversationFile && { conversation_file: conversationFile }),
        ...(llmConfig && { llm_config: llmConfig })
      }),
    })
  },

  async clearHistory(): Promise<Wrapped<{ message?: string }>> {
    const url = `${API_BASE_URL}/SmartTavern/clear_history`
    return await request(url, { method: 'POST' })
  },

  // 配置
  async getConfigOptions(): Promise<Wrapped<{ config_options: ConfigOptions }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_config_options`
    return await request(url)
  },

  async getActiveConfig(): Promise<Wrapped<{ active_config: ActiveConfig }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_active_config`
    return await request(url)
  },

  async setActiveConfig(configType: FrontendConfigKey, filePath: string | null): Promise<Wrapped<{ active_config: ActiveConfig }>> {
    const url = `${API_BASE_URL}/SmartTavern/set_active_config`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({ config_type: configType, file_path: filePath }),
    })
  },

  // 用户偏好设置相关接口
  async loadUserPreferences(): Promise<Wrapped<{ active_config: ActiveConfig }>> {
    const url = `${API_BASE_URL}/SmartTavern/load_user_preferences`
    return await request(url)
  },

  async saveUserPreferences(): Promise<Wrapped<{ message?: string }>> {
    const url = `${API_BASE_URL}/SmartTavern/save_user_preferences`
    return await request(url, { method: 'POST' })
  },

  // 文件内容获取
  async getFileContent(filePath: string): Promise<Wrapped<{ content: string; file_info?: any }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_file_content?file_path=${encodeURIComponent(filePath)}`
    return await request(url)
  },

  // 保存文件内容
  async saveFileContent(filePath: string, content: string): Promise<Wrapped<{ message?: string }>> {
    const url = `${API_BASE_URL}/SmartTavern/save_file_content`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath, content }),
    })
  },

  // 删除文件
  async deleteFile(filePath: string): Promise<Wrapped<{ message?: string }>> {
    const url = `${API_BASE_URL}/SmartTavern/delete_file`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath }),
    })
  },

  // 获取用户信息
  async getUserPersonas(): Promise<Wrapped<{ personas: any[] }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_personas`
    return await request(url)
  },

  // 获取世界书信息
  async getWorldBooks(): Promise<Wrapped<{ world_books: any[] }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_world_books`
    return await request(url)
  },

  // 获取正则规则
  async getRegexRules(): Promise<Wrapped<{ regex_rules: any[] }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_regex_rules`
    return await request(url)
  },

  // 获取文件夹内容
  async getFolderFiles(folderName?: string): Promise<Wrapped<{ folder_files: any }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_folder_files${folderName ? `?folder_name=${encodeURIComponent(folderName)}` : ''}`
    return await request(url)
  },

  // 获取角色卡列表
  async getCharacters(): Promise<Wrapped<{ characters: any[] }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_characters`
    return await request(url)
  },

  // 使用角色卡
  async useCharacter(characterPath: string): Promise<Wrapped<{ message?: string }>> {
    const url = `${API_BASE_URL}/SmartTavern/use_character`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({ character_path: characterPath }),
    })
  },

  // 创建新对话会话
  async startCharacterSession(characterPath: string): Promise<Wrapped<{ session_id?: string; initial_message?: string }>> {
    const url = `${API_BASE_URL}/SmartTavern/start_character_session`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({ character_path: characterPath }),
    })
  },

  // 获取对话文件列表（包含绑定的角色卡信息）
  async getConversationFiles(): Promise<Wrapped<{ conversations: ConversationWithCharacter[] }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_conversation_files`
    return await request(url)
  },




  // 加载指定对话文件并通过工作流处理，直接返回对话历史
  async loadConversationFile(conversationPath: string, callLlm: boolean = false): Promise<Wrapped<{
    message?: string;
    conversation_path?: string;
    character_path?: string;
    history: ApiChatMessage[];
    total_messages?: number;
  }>> {
    const url = `${API_BASE_URL}/SmartTavern/load_and_process_conversation`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({ conversation_path: conversationPath, call_llm: callLlm }),
    })
  },

  // 获取对话文件的完整绑定信息（用户+角色卡）
  async getConversationsWithFullBindings(): Promise<Wrapped<{ conversations: ConversationWithCharacter[] }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_conversations_with_full_bindings`
    return await request(url)
  },

  // 设置对话的完整绑定关系（用户+角色卡）
  async setFullBinding(conversationPath: string, userPath?: string, characterPath?: string): Promise<Wrapped<{ message?: string }>> {
    const url = `${API_BASE_URL}/SmartTavern/set_full_binding`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({
        conversation_path: conversationPath,
        user_path: userPath,
        character_path: characterPath
      }),
    })
  },

  // 获取对话的完整绑定信息
  async getFullBinding(conversationPath: string): Promise<Wrapped<{ user_path?: string; character_path?: string }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_full_binding?conversation_path=${encodeURIComponent(conversationPath)}`
    return await request(url)
  },

  // 创建新对话并设置完整绑定（用户+角色卡）
  async createNewConversationWithFullBinding(name: string, userPath: string, characterPath: string): Promise<Wrapped<{ conversation_path?: string }>> {
    const url = `${API_BASE_URL}/SmartTavern/create_new_conversation_with_full_binding`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({ name, user_path: userPath, character_path: characterPath }),
    })
  },

  // LLM API配置管理
  async getApiProviders(): Promise<Wrapped<{ providers: any[] }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_api_providers`
    return await request(url)
  },

  async saveApiProvider(provider: any): Promise<Wrapped<{ message?: string }>> {
    const url = `${API_BASE_URL}/SmartTavern/save_api_provider`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({ provider }),
    })
  },

  async deleteApiProvider(providerId: string): Promise<Wrapped<{ message?: string }>> {
    const url = `${API_BASE_URL}/SmartTavern/delete_api_provider`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({ provider_id: providerId }),
    })
  },

  // 设置活动API提供商
  async setActiveApiProvider(providerId: string): Promise<Wrapped<{ message?: string }>> {
    const url = `${API_BASE_URL}/SmartTavern/set_active_api_provider`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({ provider_id: providerId }),
    })
  },

  // 获取当前活动API提供商
  async getActiveApiProvider(): Promise<Wrapped<{ active_provider?: string }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_active_api_provider`
    return await request(url)
  },

  // 删除指定消息
  async deleteMessage(conversationFile: string, messageIndex: number): Promise<Wrapped<{
    message?: string;
    deleted_message?: { role: string; content: string };
    history: ApiChatMessage[];
    total_messages?: number;
  }>> {
    const url = `${API_BASE_URL}/SmartTavern/delete_message`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({
        conversation_file: conversationFile,
        message_index: messageIndex,
      }),
    })
  },

  // UI设置相关接口
  async getUiSettings(): Promise<Wrapped<{ ui_settings: { floorCount: number; messagePanelWidth: number; inputPanelWidth: number } }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_ui_settings`
    return await request(url)
  },

  async updateUiSettings(settings: { floorCount?: number; messagePanelWidth?: number; inputPanelWidth?: number }): Promise<Wrapped<{
    message?: string;
    updated_settings?: any;
    current_settings?: any;
  }>> {
    const url = `${API_BASE_URL}/SmartTavern/update_ui_settings`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({ settings }),
    })
  },

  // 图片文件导入相关API
  async importFilesFromImage(imageData: string, fileTypes?: string[], avoidOverwrite: boolean = true): Promise<Wrapped<{
    files: any[];
    invalid_files?: any[];
    message?: string;
  }>> {
    const url = `${API_BASE_URL}/SmartTavern/import_files_from_image`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({
        image_data: imageData,
        file_types: fileTypes,
        avoid_overwrite: avoidOverwrite
      }),
    })
  },

  async importJsonFile(fileData: string, fileType: string, fileName?: string, avoidOverwrite: boolean = true): Promise<Wrapped<{
    file?: any;
    message?: string;
  }>> {
    const url = `${API_BASE_URL}/SmartTavern/import_json_file`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({
        file_data: fileData,
        file_type: fileType,
        file_name: fileName,
        avoid_overwrite: avoidOverwrite
      }),
    })
  },

  async getAvailableFileTypes(): Promise<Wrapped<{
    file_types: {[key: string]: string};
    message?: string;
  }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_available_file_types`
    return await request(url)
  },

  // 文件导出相关API
  async embedFilesToImage(files: Array<{content: any, type: string, name: string}>, baseImageData?: string, outputFormat: string = "image"): Promise<Wrapped<{
    embedded_files?: any[];
    image_data?: string;
    data?: any;
    format?: string;
    message?: string;
  }>> {
    const url = `${API_BASE_URL}/SmartTavern/embed_files_to_image`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({
        files,
        base_image_data: baseImageData,
        output_format: outputFormat
      }),
    })
  },

  async getEmbeddedFilesInfo(imageData: string): Promise<Wrapped<{
    files_info: any[];
    message?: string;
  }>> {
    const url = `${API_BASE_URL}/SmartTavern/get_embedded_files_info`
    return await request(url, {
      method: 'POST',
      body: JSON.stringify({
        image_data: imageData
      }),
    })
  },
}
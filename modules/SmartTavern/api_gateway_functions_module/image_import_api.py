"""
SmartTavern 图片文件导入API

实现从PNG图片中提取嵌入文件的API接口
"""

import os
import json
import base64
from typing import Dict, Any, List, Optional
from pathlib import Path

from core.function_registry import register_function
from shared.SmartTavern import globals as g

def register_image_import_api():
    """注册图片文件导入相关API函数"""
    
    @register_function(name="SmartTavern.import_files_from_image", outputs=["import_result"])
    def import_files_from_image(image_data: str, file_types: Optional[List[str]] = None, avoid_overwrite: bool = True):
        """
        从Base64编码的PNG图片中提取文件并保存
        
        Args:
            image_data: Base64编码的图片数据
            file_types: 需要提取的文件类型标签列表，如不指定则提取所有类型
            avoid_overwrite: 是否避免覆盖同名文件
            
        Returns:
            提取结果
        """
        try:
            # 解码Base64图片数据
            if not image_data or not isinstance(image_data, str):
                return {
                    "success": False,
                    "error": "无效的图片数据",
                    "message": "请提供有效的Base64编码图片数据"
                }
            
            # 如果图片数据包含前缀（如"data:image/png;base64,"），移除前缀
            if "base64," in image_data:
                image_data = image_data.split("base64,")[1]
            
            # 解码Base64图片数据
            try:
                image_binary = base64.b64decode(image_data)
            except Exception as e:
                return {
                    "success": False,
                    "error": f"Base64解码失败: {str(e)}",
                    "message": "无法解码提供的图片数据"
                }
            
            # 创建临时图片文件
            temp_dir = Path("shared/SmartTavern/temp")
            temp_dir.mkdir(exist_ok=True)
            temp_image_path = str(temp_dir / f"temp_import_{os.urandom(4).hex()}.png")
            
            # 保存临时图片
            with open(temp_image_path, "wb") as f:
                f.write(image_binary)
            
            # 导入注册表和图像绑定模块
            from core.function_registry import get_registry
            registry = get_registry()
            
            # 使用图像绑定模块提取文件
            try:
                from modules.SmartTavern.image_binding_module import ImageBindingModule
                image_binding = ImageBindingModule()
                
                # 检查图片是否包含嵌入文件
                if not image_binding.is_image_with_embedded_files(temp_image_path):
                    # 删除临时文件
                    os.remove(temp_image_path)
                    return {
                        "success": False,
                        "error": "图片不包含嵌入文件",
                        "message": "提供的图片不包含任何嵌入文件"
                    }
                
                # 获取文件信息
                files_info = image_binding.get_embedded_files_info(temp_image_path)
                
                # 定义不同文件类型对应的目录
                type_dir_map = {
                    "WB": "world_books",
                    "RG": "regex_rules",
                    "CH": "characters",
                    "PS": "presets",
                    "UC": ".",  # 用户配置保存在共享目录根目录
                    "OT": "other"  # 其他类型保存在other目录
                }
                
                # 确保目录存在
                base_dir = Path("shared/SmartTavern")
                for dir_name in type_dir_map.values():
                    if dir_name != ".":
                        (base_dir / dir_name).mkdir(exist_ok=True)
                
                # 创建other目录（如果需要）
                (base_dir / "other").mkdir(exist_ok=True)
                
                # 提取文件并保存
                extracted_files = image_binding.extract_files_from_image(
                    image_path=temp_image_path,
                    output_dir=str(temp_dir),
                    filter_types=file_types
                )
                
                # 将提取的文件移动到正确的目录，避免覆盖
                processed_files = []
                invalid_files = []
                
                # 文件类型标签到类型名称的映射
                type_tag_to_name = {
                    "WB": "WORLD_BOOK",
                    "RG": "REGEX",
                    "CH": "CHARACTER",
                    "PS": "PRESET",
                    "UC": "USER_CONFIG",
                    "OT": "OTHER"
                }
                
                for file_info in extracted_files:
                    file_path = file_info["path"]
                    file_type_tag = file_info["type"]
                    file_name = file_info["name"]
                    
                    # 获取对应的文件类型名称
                    file_type_name = type_tag_to_name.get(file_type_tag, "OTHER")
                    
                    # 验证文件内容
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            try:
                                file_content = json.load(f)
                                # 验证文件内容是否符合类型特征
                                if isinstance(file_content, dict) and _validate_json_content(file_content, file_type_name):
                                    # 文件类型和内容匹配，继续处理
                                    pass
                                else:
                                    # 尝试自动识别文件类型
                                    auto_type = None
                                    for type_name in ["WORLD_BOOK", "REGEX", "CHARACTER", "PRESET", "USER_CONFIG"]:
                                        if _validate_json_content(file_content, type_name):
                                            auto_type = type_name
                                            break
                                    
                                    if auto_type:
                                        # 找到匹配的类型，更新文件类型
                                        print(f"文件 {file_name} 的标签类型 {file_type_name} 与内容不匹配，自动识别为 {auto_type}")
                                        file_type_name = auto_type
                                        # 获取对应的标签
                                        for tag, name in type_tag_to_name.items():
                                            if name == auto_type:
                                                file_type_tag = tag
                                                break
                                    else:
                                        # 没有匹配的类型，标记为无效文件
                                        invalid_files.append({
                                            "name": file_name,
                                            "type": file_type_tag,
                                            "error": "文件内容与任何已知类型不匹配"
                                        })
                                        continue
                            except json.JSONDecodeError:
                                # 无效的JSON格式
                                invalid_files.append({
                                    "name": file_name,
                                    "type": file_type_tag,
                                    "error": "无效的JSON格式"
                                })
                                continue
                    except Exception as e:
                        # 读取文件失败
                        invalid_files.append({
                            "name": file_name,
                            "type": file_type_tag,
                            "error": f"读取文件失败: {str(e)}"
                        })
                        continue
                    
                    # 确定目标目录
                    # 获取目标目录类型映射
                    type_dir_map = {
                        "WORLD_BOOK": "world_books",
                        "REGEX": "regex_rules",
                        "CHARACTER": "characters",
                        "PRESET": "presets",
                        "USER_CONFIG": ".",  # 用户配置保存在共享目录根目录
                        "OTHER": "other"  # 其他类型保存在other目录
                    }
                    
                    target_dir = type_dir_map.get(file_type_name, "other")
                    if target_dir == ".":
                        target_path = base_dir / file_name
                    else:
                        target_path = base_dir / target_dir / file_name
                    
                    # 避免重名覆盖
                    if avoid_overwrite and target_path.exists():
                        base_name = target_path.stem
                        extension = target_path.suffix
                        counter = 1
                        
                        # 尝试不同的文件名直到找到未使用的
                        while True:
                            new_name = f"{base_name}_{counter}{extension}"
                            if target_dir == ".":
                                new_path = base_dir / new_name
                            else:
                                new_path = base_dir / target_dir / new_name
                            
                            if not new_path.exists():
                                target_path = new_path
                                break
                            
                            counter += 1
                    
                    # 移动文件到目标位置
                    import shutil
                    shutil.move(file_path, str(target_path))
                    
                    # 记录处理结果
                    processed_files.append({
                        "original_name": file_name,
                        "saved_name": target_path.name,
                        "type": file_type_tag,
                        "type_name": file_type_name,
                        "path": str(target_path.relative_to(base_dir))
                    })
                
                # 清理临时文件
                os.remove(temp_image_path)
                
                # 构建返回结果
                result = {
                    "success": True,
                    "message": f"成功从图片导入了 {len(processed_files)} 个文件",
                    "files": processed_files
                }
                
                # 如果有无效文件，添加到结果中
                if invalid_files:
                    result["invalid_files"] = invalid_files
                    result["message"] += f"，{len(invalid_files)} 个文件无效"
                
                return result
                
            except Exception as e:
                # 清理临时文件
                if os.path.exists(temp_image_path):
                    os.remove(temp_image_path)
                
                return {
                    "success": False,
                    "error": f"处理图片文件失败: {str(e)}",
                    "message": "导入文件过程中出现错误"
                }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"导入文件失败: {str(e)}",
                "message": "导入过程中发生未知错误"
            }
    
    @register_function(name="SmartTavern.get_available_file_types", outputs=["file_types"])
    def get_available_file_types():
        """
        获取可用的文件类型及其描述
        
        Returns:
            可用的文件类型列表
        """
        try:
            # 定义所有支持的文件类型及其描述
            file_types = {
                "WORLD_BOOK": "世界书",
                "REGEX": "正则规则",
                "CHARACTER": "角色卡",
                "PRESET": "预设",
                "USER_CONFIG": "用户配置"
            }
            
            return {
                "success": True,
                "file_types": file_types,
                "message": "获取可用文件类型成功"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"获取文件类型失败: {str(e)}",
                "file_types": {}
            }
    
    def _validate_json_content(content: dict, file_type: str) -> bool:
        """
        验证JSON内容是否符合指定的文件类型特征
        
        Args:
            content: JSON内容
            file_type: 文件类型
            
        Returns:
            是否符合文件类型特征
        """
        if not isinstance(content, dict):
            return False
            
        # 每种文件类型的特征验证
        if file_type == "WORLD_BOOK":
            # 世界书必须包含entries或worldInfo字段
            return "entries" in content or "worldInfo" in content
            
        elif file_type == "REGEX":
            # 正则规则文件必须包含正则表达式和替换内容
            return "pattern" in content and "replacement" in content
            
        elif file_type == "CHARACTER":
            # 角色卡必须包含name和message字段
            return "name" in content and "message" in content
            
        elif file_type == "PRESET":
            # 预设文件包含temperature、max_tokens等LLM配置
            return any(key in content for key in ["temperature", "max_tokens", "top_p", "frequency_penalty", "presence_penalty"])
            
        elif file_type == "USER_CONFIG":
            # 用户配置包含preferences或settings字段
            return "preferences" in content or "settings" in content
            
        return False
    
    @register_function(name="SmartTavern.import_json_file", outputs=["import_result"])
    def import_json_file(file_data: str, file_type: str, file_name: str = None, avoid_overwrite: bool = True):
        """
        导入JSON文件并保存到对应目录，会验证文件内容是否符合指定类型特征
        
        Args:
            file_data: JSON文件的内容
            file_type: 文件类型（WORLD_BOOK/REGEX/CHARACTER/PRESET/USER_CONFIG）
            file_name: 文件名，如不提供则根据内容自动生成
            avoid_overwrite: 是否避免覆盖同名文件
            
        Returns:
            导入结果
        """
        try:
            # 验证JSON格式
            try:
                json_content = json.loads(file_data)
            except Exception as e:
                return {
                    "success": False,
                    "error": f"无效的JSON格式: {str(e)}",
                    "message": "请提供有效的JSON文件内容"
                }
            
            # 验证文件内容是否符合指定类型特征
            if not _validate_json_content(json_content, file_type):
                return {
                    "success": False,
                    "error": f"文件内容不符合{file_type}类型特征",
                    "message": "请确认文件类型与内容一致"
                }
            
            # 导入图像绑定模块以获取文件类型标签
            from modules.SmartTavern.image_binding_module.variables import FILE_TYPE_TAGS
            
            # 定义文件类型到目录的映射
            type_dir_map = {
                "WORLD_BOOK": "world_books",
                "REGEX": "regex_rules",
                "CHARACTER": "characters",
                "PRESET": "presets",
                "USER_CONFIG": ".",  # 用户配置保存在共享目录根目录
                "OTHER": "other"  # 其他类型保存在other目录
            }
            
            # 获取文件类型对应的目录
            if file_type not in type_dir_map:
                return {
                    "success": False,
                    "error": f"无效的文件类型: {file_type}",
                    "message": f"有效的文件类型: {', '.join(type_dir_map.keys())}"
                }
            
            target_dir_name = type_dir_map[file_type]
            base_dir = Path("shared/SmartTavern")
            
            # 确保目录存在
            if target_dir_name != ".":
                target_dir = base_dir / target_dir_name
                target_dir.mkdir(exist_ok=True)
            else:
                target_dir = base_dir
            
            # 处理文件名
            if not file_name:
                # 尝试从内容中获取名称
                if isinstance(json_content, dict):
                    if "name" in json_content:
                        file_name = f"{json_content['name']}.json"
                    elif "id" in json_content:
                        file_name = f"{json_content['id']}.json"
                    else:
                        file_name = f"{file_type.lower()}_{os.urandom(4).hex()}.json"
                else:
                    file_name = f"{file_type.lower()}_{os.urandom(4).hex()}.json"
            
            # 确保文件名以.json结尾
            if not file_name.lower().endswith('.json'):
                file_name += '.json'
            
            # 避免非法文件名字符
            file_name = file_name.replace('/', '_').replace('\\', '_').replace(':', '_')
            
            # 构建目标路径
            target_path = target_dir / file_name
            
            # 避免重名覆盖
            if avoid_overwrite and target_path.exists():
                base_name = target_path.stem
                extension = target_path.suffix
                counter = 1
                
                # 尝试不同的文件名直到找到未使用的
                while True:
                    new_name = f"{base_name}_{counter}{extension}"
                    new_path = target_dir / new_name
                    
                    if not new_path.exists():
                        target_path = new_path
                        break
                    
                    counter += 1
            
            # 保存文件
            with open(target_path, 'w', encoding='utf-8') as f:
                json.dump(json_content, f, ensure_ascii=False, indent=2)
            
            return {
                "success": True,
                "message": f"成功导入文件: {target_path.name}",
                "file": {
                    "name": target_path.name,
                    "type": file_type,
                    "path": str(target_path.relative_to(base_dir))
                }
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"导入JSON文件失败: {str(e)}",
                "message": "导入过程中发生未知错误"
            }
    
    print("✓ SmartTavern图片文件导入API函数注册完成")
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
    """注册图片文件导入导出相关API函数"""
    
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
                # 文件类型标签到类型名称的映射
                type_tag_to_name = {
                    "WB": "WORLD_BOOK",
                    "RX": "REGEX",
                    "CH": "CHARACTER",
                    "PS": "PRESET",
                    "PE": "PERSONA",
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
                
                # 如果指定了文件类型但没有提取到任何文件，返回特定提示
                if file_types and len(processed_files) == 0 and len(invalid_files) == 0:
                    return {
                        "success": False,
                        "error": "未找到指定类型的文件",
                        "message": f"在图片中未找到类型为 {', '.join(file_types)} 的文件"
                    }

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
    
    def _validate_json_content(content, file_type: str) -> bool:
        """
        验证JSON内容是否符合指定的文件类型特征
        
        Args:
            content: JSON内容 (可以是dict或list)
            file_type: 文件类型
            
        Returns:
            是否符合文件类型特征
        """
        # 处理嵌套数组结构的世界书文件
        if file_type == "WORLD_BOOK" and isinstance(content, list):
            # 如果是双层嵌套的数组 [[{...}, {...}]]
            if len(content) > 0 and isinstance(content[0], list):
                # 使用第一层内容验证
                if len(content[0]) > 0 and isinstance(content[0][0], dict):
                    # 验证第一个元素是否有世界书特征
                    first_item = content[0][0]
                    # 世界书条目通常有id, name, content, mode等字段
                    has_worldbook_fields = all(field in first_item for field in ["id", "name", "content"])
                    return has_worldbook_fields
            # 如果是单层数组 [{...}, {...}]
            elif len(content) > 0 and isinstance(content[0], dict):
                # 验证第一个元素是否有世界书特征
                first_item = content[0]
                # 世界书条目通常有id, name, content, mode等字段
                has_worldbook_fields = all(field in first_item for field in ["id", "name", "content"])
                return has_worldbook_fields
            return False
            
        # 处理数组结构的正则规则文件
        if file_type == "REGEX" and isinstance(content, list):
            if len(content) > 0 and isinstance(content[0], dict):
                # 验证第一个元素是否有正则规则特征
                first_item = content[0]
                # 正则规则通常有id, find_regex, replace_regex等字段
                has_regex_fields = all(field in first_item for field in ["find_regex", "replace_regex"])
                return has_regex_fields
            return False
            
        # 处理其他类型或对象类型的内容
        if not isinstance(content, dict):
            return False
            
        # 每种文件类型的特征验证
        if file_type == "WORLD_BOOK":
            # 独立的世界书文件应包含entries字段，且不应包含world_book字段（以区别于角色卡内嵌世界书）
            # 注意：部分世界书可能没有mode字段，不再强制要求
            has_entries = "entries" in content or "worldInfo" in content
            is_standalone = "world_book" not in content
            return has_entries and is_standalone
            
        elif file_type == "REGEX":
            # 处理两种可能的格式：单个对象或对象数组
            if isinstance(content, list) and len(content) > 0:
                # 如果是数组，检查第一个元素
                first_item = content[0]
                if isinstance(first_item, dict):
                    has_fields = "find_regex" in first_item and "replace_regex" in first_item
                    return has_fields
            else:
                # 单个对象格式
                has_fields = "find_regex" in content and "replace_regex" in content
                is_standalone = "regex_rules" not in content
                return has_fields and is_standalone
            
        elif file_type == "CHARACTER":
            # 角色卡必须包含name和message字段
            return "name" in content and "message" in content
            
        elif file_type == "PRESET":
            # 预设文件应包含一个prompts列表，且其中每个元素都有identifier
            if "prompts" in content and isinstance(content["prompts"], list):
                return all("identifier" in p for p in content["prompts"] if isinstance(p, dict))
            return False
            
        elif file_type == "PERSONA":
            # 用户信息（Persona）文件应包含name和description字段
            return "name" in content and "description" in content
            
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
                "PERSONA": "personas",
                "OTHER": "other"
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
    
    @register_function(name="SmartTavern.embed_files_to_image", outputs=["embed_result"])
    def embed_files_to_image(files: List[Dict[str, Any]], base_image_data: Optional[str] = None, output_format: str = "image"):
        """
        将文件嵌入到PNG图片中
        
        Args:
            files: 要嵌入的文件列表，每个文件包含content、type和name
            base_image_data: 可选的Base64编码的基础图片数据，如不提供则使用默认空白图片
            output_format: 输出格式，"image"(Base64编码的PNG) 或 "json"(JSON格式的文件内容)
            
        Returns:
            嵌入结果，包括图片数据或JSON数据
        """
        try:
            # 验证输入参数
            if not files or not isinstance(files, list):
                return {
                    "success": False,
                    "error": "无效的文件列表",
                    "message": "请提供有效的文件列表"
                }
            
            # 创建临时目录
            temp_dir = Path("shared/SmartTavern/temp")
            temp_dir.mkdir(exist_ok=True)
            
            # 如果提供了基础图片，解码并保存
            base_image_path = None
            if base_image_data:
                try:
                    # 如果图片数据包含前缀，移除前缀
                    if "base64," in base_image_data:
                        base_image_data = base_image_data.split("base64,")[1]
                    
                    # 解码Base64图片数据
                    image_binary = base64.b64decode(base_image_data)
                    
                    # 保存为临时文件
                    base_image_path = str(temp_dir / f"temp_base_{os.urandom(4).hex()}.png")
                    with open(base_image_path, "wb") as f:
                        f.write(image_binary)
                except Exception as e:
                    return {
                        "success": False,
                        "error": f"处理基础图片失败: {str(e)}",
                        "message": "无法解码或保存提供的图片数据"
                    }
            else:
                # 如果没有提供基础图片，创建一个默认的空白图片
                try:
                    from PIL import Image
                    base_image_path = str(temp_dir / f"temp_blank_{os.urandom(4).hex()}.png")
                    blank_image = Image.new('RGBA', (800, 600), (255, 255, 255, 0))
                    blank_image.save(base_image_path, 'PNG')
                except ImportError:
                    return {
                        "success": False,
                        "error": "缺少PIL库",
                        "message": "创建默认图片失败，请安装Pillow库"
                    }
                except Exception as e:
                    return {
                        "success": False,
                        "error": f"创建默认图片失败: {str(e)}",
                        "message": "无法创建默认图片"
                    }
            
            # 处理要嵌入的文件
            temp_file_paths = []
            processed_files = []
            
            try:
                # 保存每个文件到临时目录
                for i, file_info in enumerate(files):
                    if not isinstance(file_info, dict):
                        continue
                    
                    file_content = file_info.get("content")
                    file_type = file_info.get("type")
                    file_name = file_info.get("name", f"file_{i}.json")
                    
                    if not file_content or not file_type:
                        continue
                    
                    # 确保文件名有正确的扩展名
                    if not file_name.lower().endswith('.json'):
                        file_name += '.json'
                    
                    # 避免非法文件名字符
                    file_name = file_name.replace('/', '_').replace('\\', '_').replace(':', '_')
                    
                    # 保存文件到临时目录
                    temp_file_path = str(temp_dir / file_name)
                    with open(temp_file_path, 'w', encoding='utf-8') as f:
                        if isinstance(file_content, str):
                            try:
                                # 尝试解析为JSON
                                json_content = json.loads(file_content)
                                json.dump(json_content, f, ensure_ascii=False, indent=2)
                            except json.JSONDecodeError:
                                # 不是有效的JSON，直接写入
                                f.write(file_content)
                        elif isinstance(file_content, (dict, list)):
                            # 已经是字典或列表，直接写入
                            json.dump(file_content, f, ensure_ascii=False, indent=2)
                        else:
                            # 其他类型，转为字符串
                            f.write(str(file_content))
                    
                    temp_file_paths.append(temp_file_path)
                    processed_files.append({
                        "name": file_name,
                        "type": file_type,
                        "path": temp_file_path
                    })
                
                if not temp_file_paths:
                    return {
                        "success": False,
                        "error": "没有有效的文件可嵌入",
                        "message": "请提供至少一个有效的文件"
                    }
                
                # 导入图像绑定模块
                from modules.SmartTavern.image_binding_module import ImageBindingModule
                image_binding = ImageBindingModule()
                
                # 嵌入文件到图片
                output_image_path = str(temp_dir / f"output_embedded_{os.urandom(4).hex()}.png")
                image_binding.embed_files_to_image(
                    image_path=base_image_path,
                    file_paths=temp_file_paths,
                    output_path=output_image_path
                )
                
                # 根据输出格式返回结果
                if output_format.lower() == "image":
                    # 读取输出图片并转为Base64
                    with open(output_image_path, 'rb') as f:
                        output_image_binary = f.read()
                    
                    output_image_base64 = base64.b64encode(output_image_binary).decode('utf-8')
                    
                    # 构建返回结果
                    result = {
                        "success": True,
                        "message": f"成功嵌入 {len(processed_files)} 个文件",
                        "embedded_files": processed_files,
                        "image_data": output_image_base64,
                        "format": "image/png;base64"
                    }
                else:
                    # 输出JSON格式，收集所有文件的内容
                    combined_data = {}
                    for file_info in processed_files:
                        try:
                            with open(file_info["path"], 'r', encoding='utf-8') as f:
                                file_content = f.read()
                                try:
                                    # 尝试解析为JSON
                                    combined_data[file_info["name"]] = json.loads(file_content)
                                except json.JSONDecodeError:
                                    # 不是有效的JSON，保存为字符串
                                    combined_data[file_info["name"]] = file_content
                        except Exception as e:
                            print(f"读取文件 {file_info['name']} 失败: {e}")
                    
                    # 构建返回结果
                    result = {
                        "success": True,
                        "message": f"成功处理 {len(processed_files)} 个文件",
                        "files": processed_files,
                        "data": combined_data,
                        "format": "json"
                    }
                
                # 清理临时文件
                for file_path in temp_file_paths:
                    try:
                        os.remove(file_path)
                    except Exception:
                        pass
                
                try:
                    os.remove(base_image_path)
                    os.remove(output_image_path)
                except Exception:
                    pass
                
                return result
                
            except Exception as e:
                # 清理临时文件
                for file_path in temp_file_paths:
                    try:
                        os.remove(file_path)
                    except Exception:
                        pass
                
                try:
                    if base_image_path and os.path.exists(base_image_path):
                        os.remove(base_image_path)
                except Exception:
                    pass
                
                return {
                    "success": False,
                    "error": f"嵌入文件到图片失败: {str(e)}",
                    "message": "处理过程中出现错误"
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": f"嵌入文件失败: {str(e)}",
                "message": "处理过程中发生未知错误"
            }
    
    @register_function(name="SmartTavern.get_embedded_files_info", outputs=["files_info"])
    def get_embedded_files_info(image_data: str):
        """
        获取PNG图片中嵌入的文件信息
        
        Args:
            image_data: Base64编码的图片数据
            
        Returns:
            嵌入的文件信息列表
        """
        try:
            # 解码Base64图片数据
            if not image_data or not isinstance(image_data, str):
                return {
                    "success": False,
                    "error": "无效的图片数据",
                    "message": "请提供有效的Base64编码图片数据"
                }
            
            # 如果图片数据包含前缀，移除前缀
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
            temp_image_path = str(temp_dir / f"temp_info_{os.urandom(4).hex()}.png")
            
            # 保存临时图片
            with open(temp_image_path, "wb") as f:
                f.write(image_binary)
            
            try:
                # 导入图像绑定模块
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
                
                # 删除临时文件
                os.remove(temp_image_path)
                
                return {
                    "success": True,
                    "message": f"成功获取 {len(files_info)} 个嵌入文件的信息",
                    "files_info": files_info
                }
                
            except Exception as e:
                # 清理临时文件
                if os.path.exists(temp_image_path):
                    os.remove(temp_image_path)
                
                return {
                    "success": False,
                    "error": f"获取嵌入文件信息失败: {str(e)}",
                    "message": "处理图片文件过程中出现错误"
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": f"获取嵌入文件信息失败: {str(e)}",
                "message": "处理过程中发生未知错误"
            }
    
    print("✓ SmartTavern图片文件导入导出API函数注册完成")
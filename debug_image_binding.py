#!/usr/bin/env python
"""
图片绑定调试工具

用于提取PNG图片中嵌入的文件并分析可能的问题
"""

import os
import json
import sys
from pathlib import Path

# 添加项目根目录到系统路径，确保可以导入项目模块
current_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = Path(current_dir)
sys.path.insert(0, str(root_dir))

# 导入图片绑定模块
try:
    from modules.SmartTavern.image_binding_module.image_binding_module import ImageBindingModule
    from modules.SmartTavern.image_binding_module.variables import FILE_TYPE_TAGS, PNG_CHUNK_NAME
except ImportError as e:
    print(f"导入图片绑定模块失败: {e}")
    print("请确保在项目根目录运行此脚本")
    sys.exit(1)

def debug_image_file(image_path):
    """调试分析图片文件中嵌入的内容"""
    print(f"===== 分析图片文件: {image_path} =====")
    
    # 检查文件是否存在
    if not os.path.exists(image_path):
        print(f"错误: 文件不存在 - {image_path}")
        return
    
    # 创建图片绑定模块实例
    image_binding = ImageBindingModule()
    
    # 检查图片是否包含嵌入文件
    has_embedded = image_binding.is_image_with_embedded_files(image_path)
    print(f"图片是否包含嵌入文件: {has_embedded}")
    
    if not has_embedded:
        print("图片不包含嵌入文件，分析结束")
        return
    
    # 获取嵌入文件信息
    try:
        files_info = image_binding.get_embedded_files_info(image_path)
        print(f"找到 {len(files_info)} 个嵌入文件:")
        
        for i, file_info in enumerate(files_info, 1):
            print(f"\n[文件 {i}]")
            print(f"  名称: {file_info.get('name', '未知')}")
            print(f"  类型标签: {file_info.get('type', '未知')}")
            
            # 查找标签对应的类型名称
            type_tag = file_info.get('type', '')
            type_name = "未知"
            for name, tag in FILE_TYPE_TAGS.items():
                if tag == type_tag:
                    type_name = name
                    break
            
            print(f"  类型名称: {type_name}")
            print(f"  文件大小: {file_info.get('size', 0)} 字节")
    except Exception as e:
        print(f"获取文件信息失败: {e}")
    
    # 提取所有文件到临时目录
    temp_dir = Path("temp_extract")
    temp_dir.mkdir(exist_ok=True)
    
    try:
        print(f"\n正在提取文件到临时目录: {temp_dir}")
        extracted_files = image_binding.extract_files_from_image(image_path, str(temp_dir))
        
        print(f"成功提取 {len(extracted_files)} 个文件")
        
        # 分析提取的文件内容
        for i, file_info in enumerate(extracted_files, 1):
            file_path = file_info["path"]
            file_type = file_info["type"]
            file_name = file_info["name"]
            
            print(f"\n[提取文件 {i}]: {file_name} (类型: {file_type})")
            
            # 读取文件内容并解析
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                    # 尝试解析JSON
                    try:
                        json_content = json.loads(content)
                        print(f"  JSON解析成功, 字段: {list(json_content.keys())}")
                        
                        # 检查文件内容是否符合类型特征
                        print("  检查文件内容是否符合类型特征:")
                        
                        # 世界书验证
                        if file_type == "WB":
                            has_mode = "mode" in json_content and json_content.get("mode") in ["always", "conditional"]
                            has_entries = "entries" in json_content or "worldInfo" in json_content
                            is_standalone = "world_book" not in json_content
                            
                            print(f"    是世界书? {has_mode and has_entries and is_standalone}")
                            print(f"      - 具有mode字段且值合法? {has_mode}")
                            print(f"      - 具有entries或worldInfo字段? {has_entries}")
                            print(f"      - 不包含world_book字段? {is_standalone}")
                        
                        # 正则规则验证
                        elif file_type == "RG":
                            has_fields = "find_regex" in json_content and "replace_regex" in json_content
                            is_standalone = "regex_rules" not in json_content
                            
                            print(f"    是正则规则? {has_fields and is_standalone}")
                            print(f"      - 具有find_regex和replace_regex字段? {has_fields}")
                            print(f"      - 不包含regex_rules字段? {is_standalone}")
                        
                        # 打印部分内容供参考
                        print("\n  内容预览:")
                        content_preview = json.dumps(json_content, ensure_ascii=False, indent=2)[:500]
                        print(f"    {content_preview}...")
                        
                    except json.JSONDecodeError:
                        print("  无法解析为JSON")
                        print(f"  内容预览: {content[:100]}...")
            except Exception as e:
                print(f"  读取文件内容失败: {e}")
    
    except Exception as e:
        print(f"提取文件失败: {e}")
    
    print("\n===== 分析完成 =====")

def main():
    """主函数"""
    # 默认分析测试图片
    default_image = "shared/SmartTavern/test_image_binding/测试图片_embedded.png"
    
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
    else:
        image_path = default_image
        print(f"未指定图片路径，使用默认图片: {default_image}")
    
    debug_image_file(image_path)
    
    # 分析参考文件
    print("\n\n")
    print("正在分析对照文件:")
    
    # 分析世界书文件
    world_book_path = "shared/SmartTavern/world_books/参考用main_world.json"
    if os.path.exists(world_book_path):
        print(f"\n===== 分析世界书文件: {world_book_path} =====")
        try:
            with open(world_book_path, 'r', encoding='utf-8') as f:
                content = f.read()
                json_content = json.loads(content)
                print(f"  JSON解析成功, 字段: {list(json_content.keys())}")
                
                # 世界书验证
                has_mode = "mode" in json_content and json_content.get("mode") in ["always", "conditional"]
                has_entries = "entries" in json_content or "worldInfo" in json_content
                is_standalone = "world_book" not in json_content
                
                print(f"  是世界书? {has_mode and has_entries and is_standalone}")
                print(f"    - 具有mode字段且值合法? {has_mode}")
                print(f"    - 具有entries或worldInfo字段? {has_entries}")
                print(f"    - 不包含world_book字段? {is_standalone}")
                
                # 打印部分内容供参考
                print("\n  内容预览:")
                content_preview = json.dumps(json_content, ensure_ascii=False, indent=2)[:500]
                print(f"    {content_preview}...")
        except Exception as e:
            print(f"  分析世界书文件失败: {e}")
    
    # 分析正则规则文件
    regex_path = "shared/SmartTavern/regex_rules/remove_xml_tags.json"
    if os.path.exists(regex_path):
        print(f"\n===== 分析正则规则文件: {regex_path} =====")
        try:
            with open(regex_path, 'r', encoding='utf-8') as f:
                content = f.read()
                json_content = json.loads(content)
                
                if isinstance(json_content, list):
                    print(f"  JSON解析成功, 为数组类型, 包含 {len(json_content)} 个元素")
                    
                    if len(json_content) > 0 and isinstance(json_content[0], dict):
                        print(f"  第一个元素字段: {list(json_content[0].keys())}")
                        
                        # 检查是否符合正则规则格式
                        has_fields = "find_regex" in json_content[0] and "replace_regex" in json_content[0]
                        print(f"  是正则规则? {has_fields}")
                        print(f"    - 具有find_regex和replace_regex字段? {has_fields}")
                else:
                    print(f"  JSON解析成功, 字段: {list(json_content.keys())}")
                    
                    # 正则规则验证
                    has_fields = "find_regex" in json_content and "replace_regex" in json_content
                    is_standalone = "regex_rules" not in json_content
                    
                    print(f"  是正则规则? {has_fields and is_standalone}")
                    print(f"    - 具有find_regex和replace_regex字段? {has_fields}")
                    print(f"    - 不包含regex_rules字段? {is_standalone}")
                
                # 打印部分内容供参考
                print("\n  内容预览:")
                content_preview = json.dumps(json_content, ensure_ascii=False, indent=2)[:500]
                print(f"    {content_preview}...")
        except Exception as e:
            print(f"  分析正则规则文件失败: {e}")
    
    print("\n===== 调试分析结束 =====")
    print("发现的问题:")
    print("1. variables.py中REGEX的标签为'RG'，但前端使用'RX'作为过滤标签")
    print("2. 在_validate_json_content函数中，世界书验证和正则验证可能与实际文件格式不匹配")
    print("3. 如果世界书文件不包含mode字段或不是预期的值，将无法通过验证")
    print("4. 如果正则规则是数组而非对象，也可能无法通过验证")

if __name__ == "__main__":
    main()
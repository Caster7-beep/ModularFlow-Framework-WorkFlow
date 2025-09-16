import os
import json
import fnmatch
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime
from core.function_registry import register_function
from core.services import get_service_manager, get_current_globals
from . import variables as v

@register_function(name="file_manager.scan_all_files", outputs=["file_structure"])
def scan_all_files():
    """
    扫描 shared/SmartTavern 目录下的所有文件，返回完整的文件结构信息。
    """
    service_manager = get_service_manager()
    g = get_current_globals()
    
    # 获取共享数据路径
    shared_path = service_manager.get_shared_path()
    if not shared_path or not shared_path.exists():
        return {
            "success": False,
            "error": "共享数据路径不存在",
            "file_structure": {}
        }
    
    try:
        file_structure = _build_file_structure(shared_path)
        
        return {
            "success": True,
            "file_structure": file_structure,
            "total_files": _count_files(file_structure),
            "scanned_path": str(shared_path),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"扫描文件失败: {str(e)}",
            "file_structure": {}
        }

@register_function(name="file_manager.get_folder_files", outputs=["folder_files"])
def get_folder_files(folder_name: str = None):
    """
    获取指定文件夹或所有文件夹的文件列表。
    
    Args:
        folder_name: 文件夹名称，如果为 None 则返回所有文件夹
    """
    service_manager = get_service_manager()
    shared_path = service_manager.get_shared_path()
    
    if not shared_path or not shared_path.exists():
        return {
            "success": False,
            "error": "共享数据路径不存在",
            "folder_files": {}
        }
    
    try:
        if folder_name:
            # 获取指定文件夹的文件
            folder_path = shared_path / folder_name
            if not folder_path.exists():
                return {
                    "success": False,
                    "error": f"文件夹不存在: {folder_name}",
                    "folder_files": {}
                }
            
            files = _scan_folder_files(folder_path, folder_name)
            return {
                "success": True,
                "folder_files": {folder_name: files},
                "timestamp": datetime.now().isoformat()
            }
        else:
            # 获取所有文件夹的文件
            all_files = {}
            for item in shared_path.iterdir():
                if item.is_dir() and not _is_excluded_dir(item.name):
                    folder_files = _scan_folder_files(item, item.name)
                    if folder_files:  # 只包含有文件的文件夹
                        all_files[item.name] = folder_files
            
            return {
                "success": True,
                "folder_files": all_files,
                "total_folders": len(all_files),
                "timestamp": datetime.now().isoformat()
            }
            
    except Exception as e:
        return {
            "success": False,
            "error": f"获取文件夹文件失败: {str(e)}",
            "folder_files": {}
        }

@register_function(name="file_manager.get_file_content", outputs=["file_content"])
def get_file_content(file_path: str):
    """
    获取指定文件的内容。
    
    Args:
        file_path: 相对于 shared/SmartTavern 的文件路径
    """
    service_manager = get_service_manager()
    shared_path = service_manager.get_shared_path()
    
    if not shared_path or not shared_path.exists():
        return {
            "success": False,
            "error": "共享数据路径不存在",
            "file_content": None
        }
    
    try:
        full_path = shared_path / file_path
        
        if not full_path.exists():
            return {
                "success": False,
                "error": f"文件不存在: {file_path}",
                "file_content": None
            }
        
        if not full_path.is_file():
            return {
                "success": False,
                "error": f"路径不是文件: {file_path}",
                "file_content": None
            }
        
        # 读取文件内容
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 获取文件信息
        stat_info = full_path.stat()
        
        return {
            "success": True,
            "file_content": content,
            "file_info": {
                "path": file_path,
                "name": full_path.name,
                "size": stat_info.st_size,
                "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
                "extension": full_path.suffix
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"读取文件失败: {str(e)}",
            "file_content": None
        }

@register_function(name="file_manager.save_file_content", outputs=["save_result"])
def save_file_content(file_path: str, content: str):
    """
    保存内容到指定文件。
    
    Args:
        file_path: 相对于 shared/SmartTavern 的文件路径
        content: 要写入的文件内容
    """
    service_manager = get_service_manager()
    shared_path = service_manager.get_shared_path()
    
    if not shared_path or not shared_path.exists():
        return {
            "success": False,
            "error": "共享数据路径不存在"
        }
    
    try:
        full_path = shared_path / file_path
        
        # 确保目录存在
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 写入文件
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
            
        return {
            "success": True,
            "message": f"文件已保存: {file_path}",
            "file_path": str(full_path),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"保存文件失败: {str(e)}"
        }

@register_function(name="file_manager.delete_file", outputs=["delete_result"])
def delete_file(file_path: str):
    """
    删除指定文件。
    
    Args:
        file_path: 相对于 shared/SmartTavern 的文件路径
    """
    service_manager = get_service_manager()
    shared_path = service_manager.get_shared_path()
    
    if not shared_path or not shared_path.exists():
        return {
            "success": False,
            "error": "共享数据路径不存在"
        }
    
    try:
        full_path = shared_path / file_path
        
        if not full_path.exists():
            return {
                "success": False,
                "error": f"文件不存在: {file_path}"
            }
        
        if not full_path.is_file():
            return {
                "success": False,
                "error": f"路径不是文件: {file_path}"
            }
        
        # 删除文件
        full_path.unlink()
            
        return {
            "success": True,
            "message": f"文件已删除: {file_path}",
            "deleted_path": str(full_path),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"删除文件失败: {str(e)}"
        }

def _build_file_structure(root_path: Path) -> Dict[str, Any]:
    """构建文件结构树"""
    structure = {
        "name": root_path.name,
        "type": "directory",
        "path": str(root_path.relative_to(root_path.parent)),
        "children": []
    }
    
    try:
        items = []
        for item in root_path.iterdir():
            if item.is_dir() and not _is_excluded_dir(item.name):
                # 递归处理子目录
                child_structure = _build_file_structure(item)
                items.append(child_structure)
            elif item.is_file() and _is_supported_file(item):
                # 处理文件
                stat_info = item.stat()
                file_info = {
                    "name": item.name,
                    "type": "file",
                    "path": str(item.relative_to(root_path.parent)),
                    "extension": item.suffix,
                    "size": stat_info.st_size,
                    "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat()
                }
                items.append(file_info)
        
        # 按类型和名称排序 (目录在前，文件在后)
        items.sort(key=lambda x: (x["type"] == "file", x["name"].lower()))
        structure["children"] = items
        
    except Exception as e:
        print(f"构建文件结构失败: {e}")
        structure["error"] = str(e)
    
    return structure

def _scan_folder_files(folder_path: Path, folder_name: str) -> List[Dict[str, Any]]:
    """扫描文件夹中的文件"""
    files = []
    
    try:
        for item in folder_path.iterdir():
            if item.is_file() and _is_supported_file(item):
                stat_info = item.stat()
                
                # 获取文件夹的显示信息
                folder_info = v.FOLDER_MAPPING.get(folder_name, {
                    "display_name": folder_name,
                    "description": f"{folder_name} 文件夹",
                    "icon": "📁"
                })
                
                file_info = {
                    "name": item.name,
                    "path": f"{folder_name}/{item.name}",
                    "full_path": str(item),
                    "extension": item.suffix,
                    "size": stat_info.st_size,
                    "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
                    "folder": {
                        "name": folder_name,
                        "display_name": folder_info["display_name"],
                        "description": folder_info["description"], 
                        "icon": folder_info["icon"]
                    }
                }
                files.append(file_info)
            elif item.is_dir() and not _is_excluded_dir(item.name):
                # 递归处理子目录
                subfolder_files = _scan_folder_files(item, f"{folder_name}/{item.name}")
                files.extend(subfolder_files)
    
    except Exception as e:
        print(f"扫描文件夹失败 {folder_path}: {e}")
    
    # 按文件名排序
    files.sort(key=lambda x: x["name"].lower())
    return files

def _is_supported_file(file_path: Path) -> bool:
    """检查文件是否为支持的类型"""
    if file_path.suffix.lower() in v.SUPPORTED_EXTENSIONS:
        return True
    
    # 检查排除的文件模式
    for pattern in v.EXCLUDED_FILES:
        if fnmatch.fnmatch(file_path.name, pattern):
            return False
    
    return False

def _is_excluded_dir(dir_name: str) -> bool:
    """检查目录是否应该排除"""
    return dir_name in v.EXCLUDED_DIRS or dir_name.startswith('.')

def _count_files(structure: Dict[str, Any]) -> int:
    """递归计算文件数量"""
    count = 0
    if structure.get("type") == "file":
        return 1
    
    for child in structure.get("children", []):
        count += _count_files(child)
    
    return count
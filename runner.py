"""
工作流执行器
基于配置文件自动加载模块和工作流
使用全局和局部变量系统
"""
import sys
import os
import json
import importlib
import argparse
from pathlib import Path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.function_registry import get_registry
from core.services import get_service_manager, get_current_globals

# 全局变量存储加载的工作流
ALL_WORKFLOWS = {}


def load_modules():
    """通过服务管理器加载模块"""
    service_manager = get_service_manager()
    
    # 获取当前项目的全局变量
    g = get_current_globals()
    if g:
        service_manager.set_verbose(g.verbose_output)
    
    # 通过服务管理器加载所有模块
    loaded_count = service_manager.load_project_modules()
    
    if g:
        # 更新全局统计
        g.execution_count = 0  # 重置执行计数
    
    print(f"模块加载完成 (共 {loaded_count} 个)")
    print("-" * 60)


def discover_modules():
    """通过服务管理器自动发现模块"""
    service_manager = get_service_manager()
    return service_manager.discover_modules()


def discover_workflows():
    """自动发现 workflows 目录下的所有工作流"""
    workflows_dir = Path(__file__).parent / "workflows"
    workflow_files = []
    
    if workflows_dir.exists():
        for file in workflows_dir.glob("*.py"):
            if file.name != "__init__.py":
                workflow_name = file.stem
                workflow_files.append(workflow_name)
    
    return workflow_files


def load_workflows():
    """根据配置加载工作流"""
    global ALL_WORKFLOWS
    
    # 自动发现所有工作流
    all_workflow_files = discover_workflows()
    workflows_to_load = all_workflow_files
    
    # 加载工作流
    loaded_count = 0
    for workflow_name in workflows_to_load:
        try:
            module = importlib.import_module(f"workflows.{workflow_name}")
            
            # 尝试获取不同的工作流定义方式
            g = get_current_globals()
            if hasattr(module, 'WORKFLOWS'):
                # 标准的 WORKFLOWS 字典
                ALL_WORKFLOWS.update(module.WORKFLOWS)
                loaded_count += len(module.WORKFLOWS)
                if g and g.verbose_output:
                    print(f"  ✓ 从 {workflow_name} 加载了 {len(module.WORKFLOWS)} 个工作流")
            
            if hasattr(module, 'CUSTOM_WORKFLOWS'):
                # 自定义工作流字典
                ALL_WORKFLOWS.update(module.CUSTOM_WORKFLOWS)
                loaded_count += len(module.CUSTOM_WORKFLOWS)
                if g and g.verbose_output:
                    print(f"  ✓ 从 {workflow_name} 加载了 {len(module.CUSTOM_WORKFLOWS)} 个自定义工作流")
                    
        except ImportError as e:
            print(f"  ✗ 无法加载工作流文件 {workflow_name}: {e}")
            g = get_current_globals()
            if g:
                g.last_error = str(e)
    
    # 更新全局工作流计数
    g = get_current_globals()
    if g:
        g.workflow_count = loaded_count
    
    print(f"工作流加载完成 (共 {loaded_count} 个)")
    print("-" * 60)


def show_registered_functions():
    """显示已注册的函数"""
    registry = get_registry()
    functions = registry.list_functions()
    
    print("已注册的函数:")
    for func_name in functions:
        spec = registry.get_spec(func_name)
        print(f"  • {spec}")
    
    print(f"\n共 {len(functions)} 个函数")
    
    # 更新全局注册函数字典
    g = get_current_globals()
    if g:
        g.registered_functions = {name: spec for name, spec in
                                 zip(functions, [registry.get_spec(name) for name in functions])}
    
    print("-" * 60)


def show_available_workflows():
    """显示可用的工作流"""
    print("可用的工作流:")
    
    # 按类型分组显示
    orchestrator_workflows = []
    function_workflows = []
    
    for name, workflow in ALL_WORKFLOWS.items():
        if callable(workflow):
            # 检查是否返回工作流对象
            try:
                wf = workflow()
                if hasattr(wf, 'execute'):
                    orchestrator_workflows.append(name)
                else:
                    function_workflows.append(name)
            except:
                function_workflows.append(name)
    
    if orchestrator_workflows:
        print("\n编排器工作流:")
        for name in sorted(orchestrator_workflows):
            print(f"  • {name}")
    
    if function_workflows:
        print("\n函数式工作流:")
        for name in sorted(function_workflows):
            print(f"  • {name}")
    
    print(f"\n共 {len(ALL_WORKFLOWS)} 个工作流")
    print("-" * 60)


def execute_workflow(workflow_name: str, verbose: bool = True, custom_args: dict = None):
    """执行指定的工作流"""
    if workflow_name not in ALL_WORKFLOWS:
        registry = get_registry()
        if workflow_name not in registry.list_workflows():
             raise ValueError(f"工作流 '{workflow_name}' 不存在")
        workflow = registry.get_workflow(workflow_name)
    else:
        workflow = ALL_WORKFLOWS[workflow_name]

    print(f"\n执行工作流: {workflow_name}")
    print("=" * 60)
    
    # 更新全局状态
    g = get_current_globals()
    if g:
        g.is_running = True
        g.last_executed_workflow = workflow_name
    
    # 判断工作流类型并执行
    if callable(workflow):
        try:
            # 检查是否是带参数的新工作流
            if workflow_name == "full_prompt_generation_from_files" and custom_args:
                print("使用文件参数执行工作流...")
                results = workflow(
                    character_file=custom_args.get("character_file"),
                    persona_file=custom_args.get("persona_file"),
                    conversation_file=custom_args.get("conversation_file")
                )
            else:
                # 兼容旧的无参数工作流
                wf_instance = workflow()
                if hasattr(wf_instance, 'execute'):
                    results = wf_instance.execute()
                else:
                    results = wf_instance
        except TypeError:
            # 兼容旧的带默认参数的函数式工作流
            print(f"执行自定义工作流: {workflow_name}")
            results = workflow() # 简化调用
    else:
        raise ValueError(f"工作流 '{workflow_name}' 格式不正确")
    
    # 更新全局状态
    g = get_current_globals()
    if g:
        g.is_running = False
    
    # 显示结果
    print("\n执行结果:")
    print("-" * 40)
    if isinstance(results, dict):
        for key, value in results.items():
            print(f"\n{key}:")
            if isinstance(value, dict):
                for k, v in value.items():
                    if isinstance(v, (list, dict)) and len(str(v)) > 50:
                        print(f"  {k}: {type(v).__name__}({len(v)} items)")
                    else:
                        print(f"  {k}: {v}")
            else:
                print(f"  {value}")
    else:
        print(results)
    
    print("\n" + "=" * 60)
    return results


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="ModularFlow Framework - 模块化处理框架执行器")
    parser.add_argument(
        "workflow",
        nargs="?",
        help="要执行的工作流名称"
    )
    parser.add_argument(
        "--list-functions",
        action="store_true",
        help="列出所有注册的函数"
    )
    parser.add_argument(
        "--list-workflows",
        action="store_true",
        help="列出所有可用的工作流"
    )
    parser.add_argument(
        "--quiet",
        "-q",
        action="store_true",
        help="安静模式，减少输出"
    )
    parser.add_argument(
        "--no-banner",
        action="store_true",
        help="不显示启动横幅"
    )
    parser.add_argument(
        "--debug",
        "-d",
        action="store_true",
        help="启用调试模式"
    )
    
    # 为新的工作流添加参数
    parser.add_argument("--character_file", help="角色卡文件名")
    parser.add_argument("--persona_file", help="用户卡文件名")
    parser.add_argument("--conversation_file", help="对话历史文件名")

    args = parser.parse_args()
    
    # 设置调试模式
    g = get_current_globals()
    if args.debug and g:
        g.debug_mode = True
        g.verbose_output = True
    
    # 从配置更新全局设置
    if g:
        g.verbose_output = not args.quiet
    
    # 显示横幅
    if not args.no_banner:
        print("=" * 60)
        print("ModularFlow Framework")
        print("版本: 1.0.0")
        print("基于服务的模块化处理框架")
        print("=" * 60)
    
    # 设置初始化标志
    if g:
        g.is_initialized = True
    
    # 加载模块和工作流
    if not args.quiet:
        print("\n加载模块...")
    load_modules()
    
    if not args.quiet:
        print("\n加载工作流...")
    load_workflows()
    
    # 根据参数执行相应操作
    if args.list_functions:
        show_registered_functions()
    elif args.list_workflows:
        show_available_workflows()
    elif args.workflow:
        if not args.quiet:
            show_registered_functions()
        try:
            custom_args = {
                "character_file": args.character_file,
                "persona_file": args.persona_file,
                "conversation_file": args.conversation_file
            }
            execute_workflow(args.workflow, verbose=not args.quiet, custom_args=custom_args)
        except ValueError as e:
            print(f"错误: {e}")
            print("\n可用的工作流:")
            # 同时显示两种类型的workflow
            registry = get_registry()
            all_wf = set(ALL_WORKFLOWS.keys()) | set(registry.list_workflows())
            for name in sorted(list(all_wf)):
                print(f"  • {name}")
    else:
        # 默认行为：显示信息并提示
        show_registered_functions()
        show_available_workflows()
        print("\n使用方式:")
        print("  python runner.py <workflow_name>  # 执行工作流")
        print("  python runner.py --debug          # 启用调试模式")
        print("  python runner.py --help           # 查看帮助")


if __name__ == "__main__":
    main()
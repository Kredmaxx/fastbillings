import CustomCheckbox from "@components/admin/CustomCheckbox";
import FullPageLoader from "@components/admin/FullPageLoader";
import SubmitButton from "@components/admin/SubmitButton";
import Constants from "@constants/api";
import type { ModuleList } from "@models/role-permissions";
import type { RootState } from "@store/index";
import axios from "axios";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

export type ModuleListResponse = {
    success: boolean,
    message: string,
    data: ModuleList[]
}
type RolePermissionsResponse = {
    success: boolean,
    message: string,
    data: RolePermissions
}
interface Permissions {
    create: boolean;
    edit: boolean;
    delete: boolean;
    view: boolean;
    allowAll: boolean;
}
interface RolePermissions {
    roleId: string;
    roleName: string;
    permissions: PermissionsList[];
}

interface PermissionsList {
    id: string;
    roleId: string;
    /** Prisma returns the scalar FK as a string; the relation is under `module`. */
    moduleId: string;
    module?: {
        id: string;
        moduleName: string;
    };
    create: boolean;
    edit: boolean;
    delete: boolean;
    view: boolean;
    allowAll: boolean;
}
const RolePermissions: React.FC = () => {
    const { token } = useSelector((state: RootState) => state.auth);
    const { id: roleId } = useParams();
    const [modules, setModules] = useState<ModuleList[]>([]);
    const [allModules, setAllModules] = useState<ModuleList[]>([]);
    const [allRolePermissions, setAllRolePermissions] = useState<RolePermissions | null>(null);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [isFetching, setIsFetching] = useState<boolean>(false);
    const navigate = useNavigate();
    useEffect(() => {
        const fetchModules = async () => {
            try {
                const response = await axios.get<ModuleListResponse>(
                    `${Constants.FETCH_MODULES_URL}`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                setAllModules(response.data.data);
            } catch (error) {
                console.error("Failed to fetch modules:", error);
                toast.error("Could not load modules.");
            }
        };

        const fetchRolePermissions = async () => {
            try {
                setIsFetching(true);
                const response = await axios.get<RolePermissionsResponse>(
                    `${Constants.FETCH_ROLE_PERMISSIONS_URL}/${roleId}`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                setAllRolePermissions(response.data.data);
            } catch (error) {
                console.error("Failed to fetch role permissions:", error);
                toast.error("Could not load role permissions.");
            } finally {
                setIsFetching(false);
            }
        };

        if (roleId) {
            fetchModules();
            fetchRolePermissions();
        }
    }, [roleId, token]);

    // process once both are fetched
    useEffect(() => {
        if (allModules.length && allRolePermissions && allRolePermissions) {
            const processedModules = allModules.map((module) => ({
                ...module,
                children: module.children.map((child) => {
                    // find matching rolePermission for this child
                    const existingPermission = allRolePermissions.permissions.find(
                        (rp) => rp.moduleId === child.id
                    );

                    const permission = existingPermission
                        ? {
                            create: existingPermission.create,
                            edit: existingPermission.edit,
                            delete: existingPermission.delete,
                            view: existingPermission.view,
                            allowAll: existingPermission.allowAll,
                        }
                        : {
                            create: false,
                            edit: false,
                            delete: false,
                            view: false,
                            allowAll: false,
                        };

                    return { ...child, permissions: permission };
                }),
            }));

            setModules(processedModules);
        }
    }, [allModules, allRolePermissions]);

    const handleChange = (moduleIndex: number, childIndex: number, permissionType: keyof Permissions) => {
        const updatedModules = modules.map((module, mIndex) => {
            if (mIndex !== moduleIndex) {
                return module;
            }

            return {
                ...module,
                children: module.children.map((child, cIndex) => {
                    if (cIndex !== childIndex) {
                        return child;
                    }

                    const updatedPermissions = { ...child.permissions };

                    if (permissionType === 'allowAll') {
                        // If the "Allow All" checkbox is clicked, its new state determines all others.
                        const newCheckedState = !updatedPermissions.allowAll;
                        updatedPermissions.create = newCheckedState;
                        updatedPermissions.edit = newCheckedState;
                        updatedPermissions.delete = newCheckedState;
                        updatedPermissions.view = newCheckedState;
                        updatedPermissions.allowAll = newCheckedState;
                    } else {
                        // If any other checkbox is clicked, just toggle its state.
                        updatedPermissions[permissionType] = !updatedPermissions[permissionType];

                        // If the "Allow All" checkbox is now unchecked, update its state.
                        updatedPermissions.allowAll =
                            updatedPermissions.create &&
                            updatedPermissions.edit &&
                            updatedPermissions.delete &&
                            updatedPermissions.view;
                    }

                    return {
                        ...child,
                        permissions: updatedPermissions
                    };
                })
            };
        });
        setModules(updatedModules);
    };

    const handleModuleAllowAllChange = (moduleIndex: number) => {
        const updatedModules = modules.map((module, mIndex) => {
            if (mIndex !== moduleIndex) {
                return module; // This is not the module group we're changing.
            }

            const isEverythingChecked = module.children.every(
                child => child.permissions.allowAll
            );

            const newCheckedState = !isEverythingChecked;

            const updatedChildren = module.children.map(child => {
                return {
                    ...child,
                    permissions: {
                        create: newCheckedState,
                        edit: newCheckedState,
                        delete: newCheckedState,
                        view: newCheckedState,
                        allowAll: newCheckedState
                    }
                };
            });

            return {
                ...module,
                children: updatedChildren
            };
        });

        // 5. Update the state with the new array.
        setModules(updatedModules);
    };

    const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        try {
            setIsSaving(true);
            let permissions: any = [];
            modules.map((module) => {
                return module.children.map((child) => {
                    permissions.push({
                        moduleId: child.id,
                        create: child.permissions.create,
                        edit: child.permissions.edit,
                        delete: child.permissions.delete,
                        view: child.permissions.view,
                        allowAll: child.permissions.allowAll
                    });
                })
            });
            //compare with allModules & manually inject allowAll permission to parent module only if any child is checked
            modules.map((module) => {
                const isAnyChildChecked = module.children.some((child) =>
                    child.permissions.view ||
                    child.permissions.allowAll
                );
                if (isAnyChildChecked) {
                    permissions.push({
                        moduleId: module.id,
                        create: true,
                        edit: true,
                        delete: true,
                        view: true,
                        allowAll: true
                    });
                } else {
                    permissions.push({
                        moduleId: module.id,
                        create: false,
                        edit: false,
                        delete: false,
                        view: false,
                        allowAll: false
                    });
                }
            })
            const payloadData = {
                roleId: roleId,
                permissions: permissions
            }

            await axios.post(`${Constants.SAVE_PERMISSIONS_URL}`, payloadData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success("Permissions saved successfully.");

        } catch (error) {
            console.error("Error submitting form:", error);
            toast.error("An error occurred while saving. Please try again.");
        } finally {
            setIsSaving(false);
        }
    }
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-950  mb-6">
                Role Permissions
            </h1>
            <div className="flex flex-1 bg-white shadow-sm rounded-xl border border-gray-200 mb-6">
                <p className="font-bold text-gray-950 p-4 flex-1">Role Name: {allRolePermissions && allRolePermissions.roleName || ""}</p>
            </div>
            <form onSubmit={handleFormSubmit}>
                {modules && modules.length > 0 && (
                    modules.map((module, moduleIndex) => (
                        <div key={moduleIndex} className="permissions mb-6">
                            <div className="bg-white shadow-sm rounded-xl border border-gray-200">
                                {/* Header */}
                                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                                    <h2 className="font-bold text-gray-950">{module.moduleName}</h2>
                                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                        <CustomCheckbox
                                            checked={module.children.length > 0 && module.children.every(child => child.permissions.allowAll)}
                                            onChange={() => handleModuleAllowAllChange(moduleIndex)}
                                        />
                                        Allow All
                                    </label>
                                </div>

                                {/* Table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="text-sm text-gray-600 font-semibold text-left">
                                                <th className="px-4 py-3 font-semibold">MODULE</th>
                                                <th className="px-4 py-3 font-semibold">CREATE</th>
                                                <th className="px-4 py-3 font-semibold">EDIT</th>
                                                <th className="px-4 py-3 font-semibold">DELETE</th>
                                                <th className="px-4 py-3 font-semibold">VIEW</th>
                                                <th className="px-4 py-3 font-semibold">ALLOW ALL</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {module.children && module.children.length > 0 && (
                                                module.children.map((child, childIndex) => (
                                                    <tr key={childIndex} className="border-t border-gray-200  text-sm text-left">
                                                        <td className="px-4 py-3 text-sm font-medium text-gray-950">
                                                            {child.moduleName}
                                                        </td>
                                                        <td className="px-4 py-3 ">
                                                            <CustomCheckbox
                                                                checked={child?.permissions?.create || false}
                                                                onChange={() => handleChange(moduleIndex, childIndex, 'create')} />
                                                        </td>
                                                        <td className="px-4 py-3 ">
                                                            <CustomCheckbox checked={child?.permissions?.edit || false}
                                                                onChange={() => handleChange(moduleIndex, childIndex, 'edit')} />
                                                        </td>
                                                        <td className="px-4 py-3 ">
                                                            <CustomCheckbox checked={child?.permissions?.delete || false}
                                                                onChange={() => handleChange(moduleIndex, childIndex, 'delete')} />
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <CustomCheckbox checked={child?.permissions?.view || false}
                                                                onChange={() => handleChange(moduleIndex, childIndex, 'view')} />
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <CustomCheckbox checked={child?.permissions?.allowAll || false}
                                                                onChange={() => handleChange(moduleIndex, childIndex, 'allowAll')} />
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ))
                )}
                <div className="flex justify-end mt-4">
                    <button type="button" onClick={() => navigate('/admin/roles')} className="bg-gray-200 hover:bg-gray-150 text-gray-600 font-semibold py-2 px-4 rounded cursor-pointer mr-2">
                        Cancel
                    </button>
                    <SubmitButton isLoading={isSaving} isDisabled={isSaving} mode="edit" />
                </div>
            </form>
            {isFetching && <FullPageLoader />}
        </div>
    );
}

export default RolePermissions;
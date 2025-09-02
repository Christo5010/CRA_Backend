import { supabase } from '../src/utils/supabaseClient.js';
import dotenv from 'dotenv';

dotenv.config();

const createUser = async (userData) => {
  try {
    const { name, email, password, role = 'consultant', client_id } = userData;
    
    if (!name || !email || !password) {
      throw new Error('All fields are required: name, email, password');
    }
    
    // Validate role
    const validRoles = ['admin', 'consultant', 'manager'];
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }
    
    // Check if user already exists in profiles
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();
      
    if (existingProfile) {
      throw new Error('User already exists with this email');
    }
    
    // First create user in Supabase auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true
    });
    
    if (authError) {
      throw new Error(`Failed to create auth user: ${authError.message}`);
    }
    
    // Now create profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        name,
        email,
        role,
        active: true,
        client_id: client_id || null,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
      
    if (profileError) {
      // If profile creation fails, we should delete the auth user
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }
    
    console.log('✅ User created successfully:');
    console.log(`   ID: ${profile.id}`);
    console.log(`   Name: ${profile.name}`);
    console.log(`   Email: ${profile.email}`);
    console.log(`   Role: ${profile.role}`);
    console.log(`   Active: ${profile.active}`);
    console.log(`   Client ID: ${profile.client_id || 'None'}`);
    
    return profile;
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    throw error;
  }
};

// Example usage - uncomment and modify as needed
const createFirstAdmin = async () => {
  try {
    console.log('🚀 Creating first admin user...');
    await createUser({
      name: 'Admin User',
      email: 'admin@company.com',
      password: 'admin123',
      role: 'admin'
    });
    console.log('🎉 First admin user created successfully!');
  } catch (error) {
    console.error('Failed to create admin user:', error.message);
  }
};

const createDemoUsers = async () => {
  try {
    console.log('🚀 Creating demo users...');
    
    // Create consultant
    await createUser({
      name: 'Consultant Demo',
      email: 'consultant@example.com',
      password: 'password123',
      role: 'consultant'
    });
    
    // Create manager
    await createUser({
      name: 'Manager Demo',
      email: 'manager@example.com',
      password: 'password123',
      role: 'manager'
    });
    
    console.log('🎉 Demo users created successfully!');
  } catch (error) {
    console.error('Failed to create demo users:', error.message);
  }
};

// Uncomment the line below to create the first admin user
// createFirstAdmin();

// Uncomment the line below to create demo users
// createDemoUsers();

export { createUser, createFirstAdmin, createDemoUsers };

import bcrypt
from pymongo import MongoClient
from pymodm import connect, MongoModel, fields
from bson import ObjectId
from dotenv import load_dotenv
import os
from typing import List,Dict

# Load environment variables
load_dotenv()

# MongoDB connection URI from environment variables
MONGO_URI = os.getenv('MONGO_URI')
print(MONGO_URI)

# Connect to MongoDB using pymodm
connect(MONGO_URI)

class User(MongoModel):
    """
    User model for MongoDB using pymodm.
    Fields:
        user_name: Username of the user.
        password: Hashed password of the user.
        first_name: First name of the user.
        email: Email address of the user.
    """
    user_name = fields.CharField(mongo_name="User Name")
    password = fields.CharField(mongo_name="Password")
    first_name = fields.CharField(mongo_name="First Name")
    email = fields.EmailField(mongo_name="Email")

class ChatHistory(MongoModel):
    """
    Chat history model for MongoDB using pymodm.
    Fields:
        secret_key: A string representing the secret key for the chat room.
        history: List of dictionaries representing the chat history.
    """
    secret_key = fields.CharField()
    history = fields.ListField()


def signup(user: str, passw: str, first_name: str, email: str) -> User:
    """
    Sign up a new user and save to the database.

    Args:
        user: Username of the new user.
        passw: Plaintext password of the new user.
        first_name: First name of the new user.
        email: Email address of the new user.

    Returns:
        The created User object.
    """
    # Hash the password
    hashed_passw = bcrypt.hashpw(passw.encode('utf-8'), bcrypt.gensalt())
    # Create a new User object
    new_user = User(user_name=user, password=hashed_passw, first_name=first_name, email=email)
    # Save the new user to the database
    new_user.save()
    return new_user

def login(user: str, passw: str) -> User:
    """
    Log in an existing user by verifying the username and password.

    Args:
        user: Username of the user.
        passw: Plaintext password of the user.

    Returns:
        The User object if login is successful, None otherwise.
    """
    # Retrieve all users from the database
    users = User.objects.all()
    # Iterate through all users
    for u in users:
        if user == u.user_name:
            # Check the hashed password
            checkP = u.password[2:-1]  # Remove b'' from the stored hashed password
            checkP = bytes(checkP, 'utf-8')
            if bcrypt.checkpw(passw.encode('utf-8'), checkP):
                print('Login successful')
                return u
    return None

def save_chat_history(secret_key: str, new_chat: List) -> ChatHistory:
    """
    Save chat history for a given secret key. If the secret key exists, update the chat history.
    Otherwise, create a new chat history document.

    Args:
        secret_key: The secret key for the chat room.
        new_chat: A dictionary representing the new chat message to be added.

    Returns:
        The updated or created ChatHistory object.
    """
    try:
        # Check if a chat history with the given secret key exists
        chat_history = ChatHistory.objects.get({"secret_key": secret_key})
        # Append the new chat to the existing chat history
        
        chat_history.history=new_chat
        chat_history.save()
        print(f"Chat history updated for secret key: {secret_key}")
    except ChatHistory.DoesNotExist:
        # If the chat history does not exist, create a new one
        chat_history = ChatHistory(secret_key=secret_key, history=[new_chat])
        chat_history.save()
        print(f"New chat history created for secret key: {secret_key}")

    return chat_history



def test_database_functions():
    """
    Test the database functions: signup, login, and saving chat history.
    """
    # Test data
    username = "testuser"
    password = "testpassword"
    first_name = "Test"
    email = "testuser@example.com"
    secret_key = "secret123"
    

    # Sign up a new user
    print("Signing up a new user...")
    try:
        new_user = signup(username, password, first_name, email)
        print(f"User {new_user.user_name} signed up successfully.")
    except Exception as e:
        print(f"Error signing up user: {e}")
        return

    # Attempt to log in with the new user
    print("Attempting to log in with the new user...")
    try:
        logged_in_user = login(username, password)
        test_list = [
        {"user": f"{logged_in_user._id}", "role": "user", "content": "Hey"},
        {"user": f"{logged_in_user._id}", "role": "assistant", "content": "whatsup"}
    ]
        if logged_in_user:
            print(f"Login successful for user: {logged_in_user.user_name}")
        else:
            print("Login failed: Incorrect username or password.")
            return
    except Exception as e:
        print(f"Error logging in user: {e}")
        return

    # Save chat history for the logged-in user
    print("Saving chat history for the logged-in user...")
    try:
        for chat in test_list:
            save_chat_history(secret_key, chat)
        print(f"Chat history saved successfully for secret key: {secret_key}")
    except Exception as e:
        print(f"Error saving chat history: {e}")

    # # Delete the user and associated chat history
    # print("Deleting the user and associated chat history...")
    # try:
    #     logged_in_user.delete()
    #     print("User and associated chat history deleted successfully.")
    # except Exception as e:
    #     print(f"Error deleting user: {e}")





def is_username_still_valid(username: str) -> bool:
    """
    Check if the username is still valid (i.e., does not exist in the database).

    Args:
        username: The username to check.

    Returns:
        True if the username does not exist in the database, False otherwise.
    """

    try:
        # Check if a user with the given username exists
        users = User.objects.all()
        users=list(users)
        for user in users:
            if user.user_name == username:
                return False
            
        return True
        
            
    except User.DoesNotExist:
        print(f"Username '{username}' is available.")
        return True

def test_is_username_still_valid():
    """
    Test the is_username_still_valid function.
    """
    test_usernames = ["testuser", "newuser"]

    for username in test_usernames:
        if is_username_still_valid(username):
            print(f"The username '{username}' is available.")
        else:
            print(f"The username '{username}' is already taken.")

# test_is_username_still_valid()



# Run the test

# test_database_functions()






# Check if a user with the given username exists

from typing import Optional

def get_chat_history_by_secret_key(secret_key: str) -> Optional[list]:
    """
    Retrieve the chat history for a given secret key.

    Args:
        secret_key: The secret key associated with the chat history.

    Returns:
        The chat history associated with the secret key, or None if no chat history exists for the secret key.
    """
    try:
        chat_history = ChatHistory.objects.get({"secret_key": secret_key})
        return chat_history.history
    except ChatHistory.DoesNotExist:
        return []